/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";

import { BiomeDetector } from "../../../services/BiomeDetector";
import { explainMessageBlocked, explainTriggerMatch, FilterFix, flattenEmbeds, getSnipableLink, isComponentsV2, isValidMessage, sanitizeContent } from "../../../services/MessageProcessor";
import { lastSeenAgo } from "../../../services/SnipeDeduplicator";
import { settings } from "../../../settings";
import { JoinLockStore } from "../../../stores/JoinLockStore";
import { getActiveTriggers, getTriggers, Trigger, updateTrigger } from "../../../stores/TriggerStore";
import { SnipableLink } from "../../../types";
import { formatElapsedTime, getCurrentVersion, parseCsv } from "../../../utils";

// Walks a message through the same checks as handleMessage in index.tsx, without acting on it.
// Keep the order and the rules in sync with handleMessage, JoinService, NotificationService,
// ForwardingService and BiomeWatcher.

export type StepStatus = "pass" | "fail" | "warn" | "info" | "skip";
export type GroupKey = "read" | "match" | "join" | "after";
export type Verdict = "ignored" | "saved" | "join";

export interface Fix {
    label: string;
    run: () => void | Promise<void>;
}

export interface DebugStep {
    group: GroupKey;
    name: string;
    status: StepStatus;
    detail?: string;
    fixes?: Fix[];
}

export interface DebugResult {
    verdict: Verdict;
    title: string;
    detail: string;
    steps: DebugStep[];
    /** Whether the run got to the point where a snipe is saved to History */
    reachedHistory: boolean;
    interpretedContent: string;
    link: SnipableLink | null;
    trigger: Trigger | null;
}

export const GROUPS: [GroupKey, string][] = [
    ["read", "Read the message"],
    ["match", "Match a trigger"],
    ["join", "Join"],
    ["after", "Notify and forward"],
];

/** Every step in order. Steps a run never reaches are shown as "Not reached". */
// A snipe is saved to History between "Match a trigger" (which ends with the join lock) and "Join"
export const ALL_STEPS: [GroupKey, string][] = [
    ["read", "Valid message"], ["read", "Roblox link"],
    ["match", "Trigger"], ["match", "Filters"],
    ["match", "Join lock"],
    ["join", "Duplicate link"], ["join", "Auto-join"], ["join", "Already in biome?"], ["join", "Link check"], ["join", "Join"],
    ["after", "Notification"], ["after", "Forwarding"],
];

const FRESH_KEYWORDS = ["start", "fresh"];

// --- Fixes ---

type CsvKey = "ignoredGuilds" | "ignoredChannels" | "ignoredUsers" | "monitoredGuilds";

function editCsv(key: CsvKey, id: string, add: boolean) {
    const ids = parseCsv(settings.store[key] as string);
    if (add) ids.add(id); else ids.delete(id);
    settings.store[key] = [...ids].join(", ");
}

function filterFix(fix: FilterFix): Fix {
    switch (fix.kind) {
        case "unignoreGuild": return { label: "Stop ignoring this server", run: () => editCsv("ignoredGuilds", fix.id, false) };
        case "unignoreChannel": return { label: "Stop ignoring this channel", run: () => editCsv("ignoredChannels", fix.id, false) };
        case "unignoreUser": return { label: "Stop ignoring this user", run: () => editCsv("ignoredUsers", fix.id, false) };
        case "monitorGuild": return { label: "Monitor this server", run: () => editCsv("monitoredGuilds", fix.id, true) };
    }
}

const patchConditions = (t: Trigger, patch: Partial<Trigger["conditions"]>) => updateTrigger(t.id, { conditions: { ...t.conditions, ...patch } });
const patchState = (t: Trigger, patch: Partial<Trigger["state"]>) => updateTrigger(t.id, { state: { ...t.state, ...patch } });

const shortCode = (code: string) => code.length > 14 ? `${code.slice(0, 8)}…${code.slice(-5)}` : code;
const LINK_NAMES: Record<SnipableLink["type"], string> = { share: "Share link", private: "Private server link", joinguard: "Joinguard link" };

// --- Analysis ---

export function analyzeMessage(original: Message, channel: Channel, guild: Guild): DebugResult {
    // Work on a copy, so the analysis never changes the real message
    const message = { ...original, embeds: [...original.embeds] } as Message;
    const steps: DebugStep[] = [];
    const add = (step: DebugStep) => steps.push(step);
    let reachedHistory = false;
    let link: SnipableLink | null = null;
    let trigger: Trigger | null = null;
    // The text Sol Radar reads, taken before links are stripped for keyword matching
    let readText = message.content;

    const done = (verdict: Verdict, title: string, detail: string): DebugResult =>
        ({ verdict, title, detail, steps, reachedHistory, interpretedContent: readText, link, trigger });
    const ignored = (detail: string) => done("ignored", "Ignored, nothing saved", detail);
    const saved = (detail: string) => done("saved", "Saved to History, not joined", detail);

    // --- Read the message ---

    const isNativeForward = Array.isArray((original as any).messageSnapshots) && (original as any).messageSnapshots.length > 0;
    if (isNativeForward) {
        add({ group: "read", name: "Valid message", status: "fail", detail: "This is a Discord forward. Sol Radar only reads original messages." });
        return ignored("Discord forwards are skipped.");
    }

    if (!isValidMessage(message)) {
        const reforward = message.embeds.some(e => e.type === "rich" && (e as any).footer?.text?.toLowerCase() === "solradar");
        add({
            group: "read", name: "Valid message", status: "fail",
            detail: reforward
                ? "This is a Sol Radar forward from someone else. \"Ignore forwards\" is on to avoid loops."
                : "Sent by the webhook your triggers forward to.",
        });
        return ignored("Sol Radar skips its own forwards to avoid loops.");
    }
    add({ group: "read", name: "Valid message", status: "pass", detail: "Not a self-forward or re-forward." });

    const v2 = (original.components?.length ?? 0) > 0 && isComponentsV2(original);
    const contentBefore = message.content;
    flattenEmbeds(message);
    readText = message.content;
    const readEmbeds = message.content !== contentBefore;

    link = getSnipableLink(message.content);
    if (!link) {
        const text = message.content ?? "";
        const kinds = [/roblox\.com\/share\?code=/i, /roblox\.com\/games\/\d+[^?]*\?privateserverlinkcode=/i, /join-guard\.solsstattracker\.com\//i].filter(re => re.test(text)).length;
        const hasJoinguard = /join-guard\.solsstattracker\.com\//i.test(text);
        const fixes: Fix[] = [];
        let detail = "No Roblox link found in this message.";
        if ((original.embeds.length > 0 || v2) && !settings.store.flattenEmbeds) {
            detail = v2
                ? "No link in the text. This message keeps its text and buttons in components, and \"Interpret embeds\" is off."
                : "No link in the text. This message has embeds, and \"Interpret embeds\" is off.";
            fixes.push({ label: "Turn on Interpret embeds", run: () => { settings.store.flattenEmbeds = true; } });
        } else if (original.embeds.length > 0 && !v2 && !settings.store.advancedEmbedFlattening) {
            detail = "Embeds were read, but no link was found. If it's in a button or field, turn on Advanced embed flattening.";
            fixes.push({ label: "Turn on Advanced embed flattening", run: () => { settings.store.advancedEmbedFlattening = true; } });
        } else if (kinds > 1 && !settings.store.resolveAmbiguousLinks) {
            detail = "More than one kind of Roblox link, and \"Force match on multiple links\" is off.";
            fixes.push({ label: "Turn on Force match", run: () => { settings.store.resolveAmbiguousLinks = true; } });
        } else if (hasJoinguard && !settings.store.interpretJoinguardLinks) {
            detail = "There's a Joinguard link, and \"Interpret Joinguard links\" is off.";
            fixes.push({ label: "Turn on Joinguard links", run: () => { settings.store.interpretJoinguardLinks = true; } });
        }
        add({ group: "read", name: "Roblox link", status: "fail", detail, fixes });
        return ignored(fixes.length ? detail : "There's no Roblox link in this message.");
    }
    add({
        group: "read", name: "Roblox link", status: "pass",
        detail: `${LINK_NAMES[link.type]}, code ${shortCode(link.code)}${link.type === "private" ? `, place ${link.placeId}` : ""}${readEmbeds ? (v2 ? ". Read from the message's components." : ". Read from an embed.") : "."}`,
    });

    // --- Match a trigger ---

    sanitizeContent(message);
    const active = getActiveTriggers();

    // Triggers that are turned off but would match this message
    const off = getTriggers().filter(t => !t.state.enabled);
    const offMatches = off.length ? explainTriggerMatch(message, off).matched : [];
    const offNames = offMatches.map(t => t.name).join(", ");
    const turnOn = offMatches.slice(0, 3).map(t => ({ label: `Turn on ${t.name}`, run: () => patchState(t, { enabled: true }) }));
    const offVerdict = `${offMatches.length === 1 ? `${offNames} would match, but it's` : `${offNames} would match, but they're`} turned off.`;

    if (!active.length) {
        add({ group: "match", name: "Trigger", status: "fail", detail: `You have no active triggers.${offMatches.length ? ` Would match if turned on: ${offNames}.` : ""}`, fixes: turnOn });
        return ignored(offMatches.length ? offVerdict : "You have no active triggers.");
    }

    const match = explainTriggerMatch(message, active);
    trigger = match.winner;
    if (!trigger) {
        if (match.ambiguous.length) {
            const names = match.ambiguous.map(t => `${t.name} (${t.state.priority})`).join(" and ");
            const best = [...match.ambiguous].sort((a, b) => a.state.priority - b.state.priority)[0];
            add({
                group: "match", name: "Trigger", status: "fail",
                detail: `${names} all matched. When more than one trigger matches, they're all dropped unless one bypasses "several triggers matched".`,
                fixes: [{ label: `Let ${best.name} win ties`, run: () => patchConditions(best, { bypassMatchAmbiguity: true }) }],
            });
            return ignored(`${match.ambiguous.map(t => t.name).join(" and ")} all matched, so none of them fires.`);
        }
        add({
            group: "match", name: "Trigger", status: "fail",
            detail: `None of your ${active.length} active triggers matched.${offMatches.length ? ` Would match if turned on: ${offNames}.` : ""}`,
            fixes: turnOn,
        });
        return ignored(offMatches.length ? offVerdict : "No active trigger matched.");
    }
    add({
        group: "match", name: "Trigger", status: "pass",
        detail: `Matched ${trigger.name} (priority ${trigger.state.priority})${match.via ? ` by ${match.via}` : ""}.${offMatches.length ? ` Turned off but would also match: ${offNames}.` : ""}`,
    });

    const blocked = explainMessageBlocked({ channel, message, trigger });
    if (blocked) {
        add({ group: "match", name: "Filters", status: "fail", detail: blocked.reason, fixes: blocked.fix ? [filterFix(blocked.fix)] : undefined });
        return ignored(blocked.reason);
    }
    add({ group: "match", name: "Filters", status: "pass", detail: "Not blocked by any filter." });

    // --- Save to History ---

    const lock = JoinLockStore.current;
    if (lock && JoinLockStore.isBlocked(trigger.state.priority)) {
        const left = formatElapsedTime(JoinLockStore.msRemaining());
        add({
            group: "match", name: "Join lock", status: "fail",
            detail: `${lock.triggerName} (priority ${lock.priority}) holds the lock, and ${trigger.name} (priority ${trigger.state.priority}) isn't more important. ${left} left.`,
            fixes: [{ label: "Release join lock", run: () => JoinLockStore.release() }],
        });
        return ignored(`${lock.triggerName} holds the join lock for ${left} more.`);
    }
    add({ group: "match", name: "Join lock", status: "pass", detail: lock ? `${lock.triggerName} holds a lock, but ${trigger.name} is more important.` : "No lock is active." });

    reachedHistory = true;

    const t = trigger;
    const seenAgo = lastSeenAgo(t.name, link.code);
    if (seenAgo != null) {
        const ago = formatElapsedTime(seenAgo);
        if (settings.store.deduplicateLinks && !t.conditions.bypassLinkDeduplication) {
            add({
                group: "join", name: "Duplicate link", status: "fail",
                detail: `${t.name} saw this link ${ago} ago. It's saved as Ignored.`,
                fixes: [{ label: `Let ${t.name} repeat links`, run: () => patchConditions(t, { bypassLinkDeduplication: true }) }],
            });
            return saved(`The same link was posted ${ago} ago.`);
        }
        add({ group: "join", name: "Duplicate link", status: "warn", detail: `Seen ${ago} ago, but repeats are allowed, so it continues.` });
    } else {
        add({ group: "join", name: "Duplicate link", status: "pass", detail: "Not seen in the last 10 minutes." });
    }

    // --- Join ---

    const after = () => {
        add(settings.store.notificationEnabled && t.state.notify
            ? { group: "after", name: "Notification", status: "pass", detail: t.state.notificationSound ? "With this trigger's custom sound." : "Discord notification." }
            : { group: "after", name: "Notification", status: "info", detail: !settings.store.notificationEnabled ? "Notifications are off in Settings." : `Off for ${t.name}.` });
        add({ group: "after", name: "Forwarding", ...forwardingOutcome(t, channel, guild) });
    };

    if (!settings.store.autoJoinEnabled) {
        add({ group: "join", name: "Auto-join", status: "fail", detail: "Auto-join is off in Settings.", fixes: [{ label: "Turn on auto-join", run: () => { settings.store.autoJoinEnabled = true; } }] });
        after();
        return saved("Auto-join is off in Settings. You'd only get a notification.");
    }
    if (!t.state.autojoin) {
        add({ group: "join", name: "Auto-join", status: "fail", detail: `Off for ${t.name}. On in Settings.`, fixes: [{ label: `Turn on for ${t.name}`, run: () => patchState(t, { autojoin: true }) }] });
        after();
        return saved(`Auto-join is off for ${t.name}. You'd only get a notification.`);
    }
    add({ group: "join", name: "Auto-join", status: "pass", detail: `On in Settings and for ${t.name}.` });

    if (t.biome?.skipRedundantJoin) {
        const expected = t.biome.detectionKeyword || t.name;
        const fresh = FRESH_KEYWORDS.some(kw => message.content.toLowerCase().includes(kw));
        if (BiomeDetector.isAnyAccountInBiome(expected) && !fresh) {
            add({ group: "join", name: "Already in biome?", status: "fail", detail: `An account is already in ${expected.toUpperCase()}. A message with "fresh" or "start" would join anyway.` });
            after();
            return saved(`You're already in ${expected.toUpperCase()}, and ${t.name} skips redundant joins.`);
        }
        add({ group: "join", name: "Already in biome?", status: "pass", detail: fresh && BiomeDetector.isAnyAccountInBiome(expected) ? `In ${expected.toUpperCase()}, but "fresh" or "start" lets it join.` : `No account is in ${expected.toUpperCase()}.` });
    } else {
        add({ group: "join", name: "Already in biome?", status: "info", detail: `${t.name} doesn't skip redundant joins.` });
    }

    const mode = settings.store.linkVerification;
    if (t.conditions.bypassLinkVerification) add({ group: "join", name: "Link check", status: "info", detail: `${t.name} skips link checks.` });
    else if (mode === "disabled") add({ group: "join", name: "Link check", status: "info", detail: "Link checks are off in Settings." });
    else if (link.type === "joinguard") add({ group: "join", name: "Link check", status: "warn", detail: "Joinguard links can't be checked, so it joins without checking." });
    else if (!settings.store.robloxToken) {
        if (mode === "before") {
            add({ group: "join", name: "Link check", status: "fail", detail: "Links are checked before joining, but no Roblox token is set, so the check fails and it won't join." });
            after();
            return saved("Links are checked before joining, and no Roblox token is set.");
        }
        add({ group: "join", name: "Link check", status: "warn", detail: "Checked after joining, but no Roblox token is set, so the check will fail." });
    } else {
        add({ group: "join", name: "Link check", status: "info", detail: `Checked ${mode === "before" ? "before" : "after"} joining. Use Check Roblox PlaceID to test it now.` });
    }

    const safe = settings.store.joinMode === "safe";
    add({
        group: "join", name: "Join", status: "pass",
        detail: `${safe ? "Safe mode: closes Roblox, then opens the link." : "Opens the link without closing Roblox."}${settings.store.sendKillProcessSignal ? " Your macro is closed too." : ""}`,
    });

    after();
    return done("join", `Would join ${t.name}`, mode === "before" && !t.conditions.bypassLinkVerification && link.type !== "joinguard"
        ? "If the link passes the check, it joins and then watches for the biome."
        : "It joins right away, then follows the steps below.");
}

function forwardingOutcome(t: Trigger, channel: Channel, guild: Guild): Pick<DebugStep, "status" | "detail"> {
    const { onMatch, onDetection } = t.forwarding;
    if (!onMatch.enabled && !onDetection.enabled) return { status: "info", detail: `Off for ${t.name}.` };
    if (!settings.store.forwardingEnabled) return { status: "info", detail: "Forwarding is off in Settings." };
    if (!(t.forwarding.webhookUrl || settings.store.globalWebhookUrl)) return { status: "warn", detail: "On, but no webhook URL is set." };
    if (t.forwarding.excludedGuilds?.includes(guild.id)) return { status: "info", detail: `${t.name} doesn't forward from this server.` };
    if (t.forwarding.excludedChannels?.includes(channel.id)) return { status: "info", detail: `${t.name} doesn't forward from #${channel.name}.` };
    if (!t.conditions.bypassForwardIgnoredGuilds && parseCsv(settings.store.forwardIgnoredGuilds).has(guild.id)) return { status: "info", detail: "This server is in \"Never forward from these servers\"." };
    const when = [onMatch.enabled && (onMatch.early ? "on match, before joining" : "on match"), onDetection.enabled && "when the biome is confirmed"].filter(Boolean).join(" and ");
    return { status: "pass", detail: `To your webhook, ${when}.` };
}


/**
 * The result as a code block, ready to paste in Discord when asking for help.
 * Includes the settings that change the outcome most, so nobody has to ask for them.
 */
export function debugReport(result: DebugResult, message: Message, channel: Channel, guild: Guild): string {
    // Diff format: Discord colors "+" lines green and "-" lines red. The marks stay, so it still reads without the code block.
    const mark: Record<StepStatus, string> = { pass: "✓", fail: "✗", warn: "!", info: "i", skip: "·" };
    const sign: Record<StepStatus, string> = { pass: "+", fail: "-", warn: " ", info: " ", skip: " " };
    const verdictSign: Record<Verdict, string> = { join: "+", saved: " ", ignored: "-" };
    const author = (message.author as any)?.username ?? "unknown";
    const when = new Date(message.timestamp as any);
    const on = (v: unknown) => (v ? "on" : "off");

    const steps = ALL_STEPS.map(([group, name]) => result.steps.find(s => s.group === group && s.name === name) ?? { group, name, status: "skip" as const, detail: "Not reached." });
    const body = GROUPS.flatMap(([key, title]) => [
        `@@ ${title} @@`,
        ...steps.filter(s => s.group === key).map(s => `${sign[s.status]} ${mark[s.status]} ${s.name}: ${s.detail ?? ""}`),
    ]);

    return [
        "```diff",
        `  Sol Radar ${getCurrentVersion()} · snipe debug`,
        `${verdictSign[result.verdict]} ${result.title}: ${result.detail}`,
        "",
        `  Message   ${author} in #${channel.name} (${guild.name})${isNaN(+when) ? "" : `, ${when.toLocaleString()}`}`,
        `  Trigger   ${result.trigger ? `${result.trigger.name} (priority ${result.trigger.state.priority})` : "none"}`,
        `  Link      ${result.link ? `${result.link.type}, ${result.link.code}` : "none"}`,
        `  Settings  auto-join ${on(settings.store.autoJoinEnabled)}, link verification ${settings.store.linkVerification}, interpret embeds ${on(settings.store.flattenEmbeds)}, join mode ${settings.store.joinMode}`,
        "",
        ...body,
        "",
        "@@ Content (first 300 characters) @@",
        // Indented so a line starting with + or - in the message isn't colored
        ...(result.interpretedContent.slice(0, 300).replace(/```/g, "'''") || "(empty)").split("\n").map(l => `  ${l}`),
        "```",
    ].join("\n");
}
