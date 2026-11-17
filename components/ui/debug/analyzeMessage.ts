/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";

import { BiomeDetector } from "../../../services/BiomeDetector";
import { explainTriggerMatch, flattenEmbeds, getSnipableLink, invalidMessageReason, isComponentsV2, sanitizeContent } from "../../../services/MessageProcessor";
import { FilterFix, hasBypass } from "../../../services/scope";
import { ScopeBlock } from "../../../services/scopeRules";
import { lastSeenAgo } from "../../../services/SnipeDeduplicator";
import { settings } from "../../../settings";
import { JoinLockStore } from "../../../stores/JoinLockStore";
import { expectedBiomes, formatBiomes, getActiveTriggers, getFolder, getTriggers, isTriggerRunning, Trigger, updateFolder, updateTrigger } from "../../../stores/TriggerStore";
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

export type LeftOutKind = "server" | "channel" | "monitor" | "userx" | "word" | "folder" | "user";

/** Triggers that matched the words but were left out for the same reason and source. Only the checklist draws these. */
export interface LeftOutGroup {
    kind: LeftOutKind;
    tone: "global" | "folder" | "own";
    folderColor?: string;
    short: string;
    reason: string;
    source: string;
    triggers: Trigger[];
    byUser?: boolean;
}

export interface DebugStep {
    group: GroupKey;
    name: string;
    status: StepStatus;
    detail?: string;
    fixes?: Fix[];
    leftOut?: LeftOutGroup[];
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

type Rejected = ReturnType<typeof explainTriggerMatch>["rejected"][number];

const KIND_BY_LIST: Record<ScopeBlock["list"], LeftOutKind> = {
    neverServers: "server", neverChannels: "channel", neverUsers: "user",
    onlyServers: "monitor", onlyChannels: "monitor", onlyUsers: "user",
};
const OWN_SHORT: Record<ScopeBlock["list"], string> = {
    neverServers: "Never in this server", neverChannels: "Never in this channel", neverUsers: "Never for this user",
    onlyServers: "Not in its servers", onlyChannels: "Not in its channels", onlyUsers: "Other users only",
};
const OWN_USER_REASON: Record<"neverUsers" | "onlyUsers", string> = { neverUsers: "Never fires for this user", onlyUsers: "Only fires for certain users" };

// The icon, tone and labels of one left-out trigger
function describeLeftOut(r: Rejected, username: string): Omit<LeftOutGroup, "triggers"> {
    const folder = getFolder(r.trigger.folderId);
    if (r.block) {
        const { tier, list } = r.block;
        const byUser = list === "neverUsers" || list === "onlyUsers";
        if (tier === "global") {
            const short = { neverServers: "Ignored server", neverChannels: "Ignored channel", neverUsers: "Ignored user", onlyUsers: "Other users only", onlyServers: "Not monitored", onlyChannels: "Not monitored" }[list];
            return { kind: list === "neverUsers" ? "userx" : KIND_BY_LIST[list], tone: "global", short, reason: r.reason, source: "Settings", byUser };
        }
        if (tier === "folder") return { kind: "folder", tone: "folder", folderColor: folder?.color, short: OWN_SHORT[list], reason: r.reason, source: `Folder · ${folder?.name}`, byUser };
        // Trigger reasons start with the trigger's name, which would only name one of a shared group
        const reason = byUser ? `${OWN_USER_REASON[list]}${list === "neverUsers" ? ` (${username})` : ""} (its Filters).` : r.reason;
        return { kind: KIND_BY_LIST[list], tone: "own", short: OWN_SHORT[list], reason, source: "Own filters", byUser };
    }
    return r.globalExclude
        ? { kind: "word", tone: "global", short: "Excluded word", reason: `The global "Must not contain" list has "${r.word}".`, source: "Settings" }
        : { kind: "word", tone: "own", short: "Excluded word", reason: `Its "Must not contain" has "${r.word}".`, source: "Own filters" };
}

const TONE_ORDER = { global: 0, folder: 1, own: 2 };

// Rejected triggers that would have matched without the filter, grouped by reason and source. Settings first, then folders, then own filters.
function leftOutGroups(rejected: Rejected[], wouldMatch: Trigger[], username: string): LeftOutGroup[] {
    const groups = new Map<string, LeftOutGroup>();
    for (const r of rejected) {
        if (r.filtered ? !wouldMatch.includes(r.trigger) : !r.word) continue;
        const info = describeLeftOut(r, username);
        const key = `${info.source}|${info.byUser ? info.short : ""}|${info.reason}`;
        const group = groups.get(key) ?? { ...info, triggers: [] };
        group.triggers.push(r.trigger);
        groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}

// The same groups as one plain sentence, for the report and the trace
function leftOutText(groups: LeftOutGroup[]): string {
    const shown = groups.filter(g => !g.byUser);
    const byUserCount = groups.filter(g => g.byUser).reduce((n, g) => n + g.triggers.length, 0);
    const lines = shown.map(g => {
        const names = g.triggers.filter(t => !g.reason.startsWith(t.name)).map(t => t.name);
        return names.length ? `${names.join(", ")}: ${g.reason}` : g.reason;
    });
    if (byUserCount) lines.push(`${byUserCount === 1 ? "1 trigger only fires" : `${byUserCount} triggers only fire`} for other users.`);
    return shown.length === 1 && shown[0].triggers.length === 1 && !byUserCount ? shown[0].reason : lines.join(" ");
}

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

    const invalid = invalidMessageReason(message);
    if (invalid) {
        add({
            group: "read", name: "Valid message", status: "fail",
            detail: invalid === "reforward"
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

    // Triggers that are turned off, or sit in a paused folder, but would match this message
    const off = getTriggers().filter(t => !isTriggerRunning(t));
    const offMatches = off.length ? explainTriggerMatch(message, off, { channel }).matched : [];
    const offNames = offMatches.map(t => t.name).join(", ");
    const turnOn = offMatches.slice(0, 3).map(t => {
        const folder = getFolder(t.folderId);
        return folder?.paused && t.state.enabled
            ? { label: `Turn on the ${folder.name} folder`, run: () => updateFolder(folder.id, { paused: false }) }
            : { label: `Turn on ${t.name}`, run: () => patchState(t, { enabled: true }) };
    });
    const offVerdict = `${offMatches.length === 1 ? `${offNames} would match, but it's` : `${offNames} would match, but they're`} turned off.`;

    if (!active.length) {
        add({ group: "match", name: "Trigger", status: "fail", detail: `You have no active triggers.${offMatches.length ? ` Would match if turned on: ${offNames}.` : ""}`, fixes: turnOn });
        return ignored(offMatches.length ? offVerdict : "You have no active triggers.");
    }

    const match = explainTriggerMatch(message, active, { channel });
    trigger = match.winner;

    // Triggers a filter or an excluded word left out, among those that would otherwise have matched
    const wouldMatch = explainTriggerMatch(message, active).matched;
    const leftOut = leftOutGroups(match.rejected, wouldMatch, message.author.username);
    const leftOutCount = leftOut.reduce((n, g) => n + g.triggers.length, 0);
    const removedFixes = [...new Map(match.rejected.filter(r => r.filtered && wouldMatch.includes(r.trigger)).flatMap(r => r.fix ? [r.fix] : []).map(f => [`${f.kind}:${f.id}`, f])).values()].slice(0, 3).map(filterFix);
    const bypassFixes = match.rejected.filter(r => r.globalExclude).slice(0, 3)
        .map(r => ({ label: `Let ${r.trigger.name} ignore the global list`, run: () => patchConditions(r.trigger, { bypassGlobalExclude: true }) }));
    const filterFixes = [...removedFixes, ...bypassFixes];
    const leftOutDetail = leftOutText(leftOut);
    // Name a trigger that wasn't user-filtered when there is one
    const firstName = (leftOut.find(g => !g.byUser) ?? leftOut[0])?.triggers[0].name;
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
        if (leftOutCount) {
            add({ group: "match", name: "Filters", status: "fail", detail: leftOutDetail, leftOut, fixes: filterFixes.length ? filterFixes : undefined });
            return ignored(leftOutCount === 1 ? `${firstName} was left out by a filter.` : `${firstName} and ${leftOutCount - 1} ${leftOutCount === 2 ? "other were" : "others were"} left out by filters.`);
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

    const others = leftOut.filter(g => !g.byUser).reduce((n, g) => n + g.triggers.length, 0);
    add({ group: "match", name: "Filters", status: "pass", detail: others ? `Not blocked. ${others === 1 ? "1 other trigger was" : `${others} other triggers were`} filtered out.` : "Not blocked by any filter." });

    // --- Save to History ---

    const lock = JoinLockStore.current;
    if (lock && JoinLockStore.isBlocked(trigger.state.priority)) {
        const openEnded = lock.lockedUntil === Infinity;
        const left = openEnded ? "until its biome ends" : `for ${formatElapsedTime(JoinLockStore.msRemaining())} more`;
        add({
            group: "match", name: "Join lock", status: "fail",
            detail: `${lock.triggerName} (priority ${lock.priority}) holds the lock, and ${trigger.name} (priority ${trigger.state.priority}) isn't more important. The lock stays ${left}.`,
            fixes: [{ label: "Release join lock", run: () => JoinLockStore.release() }],
        });
        return ignored(`${lock.triggerName} holds the join lock ${left}.`);
    }
    add({ group: "match", name: "Join lock", status: "pass", detail: lock ? `${lock.triggerName} holds a lock, but ${trigger.name} is more important.` : "No lock is active." });

    reachedHistory = true;

    const t = trigger;
    const seenAgo = lastSeenAgo(t.name, link.code);
    if (seenAgo != null) {
        const ago = formatElapsedTime(seenAgo);
        if (settings.store.deduplicateLinks && !hasBypass(t, "bypassLinkDeduplication")) {
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
        const list = expectedBiomes(t);
        const inBiome = list.find(b => BiomeDetector.isAnyAccountInBiome(b));
        const fresh = FRESH_KEYWORDS.some(kw => message.content.toLowerCase().includes(kw));
        if (inBiome && !fresh) {
            add({ group: "join", name: "Already in biome?", status: "fail", detail: `An account is already in ${inBiome}. A message with "fresh" or "start" would join anyway.` });
            after();
            return saved(`You're already in ${inBiome}, and ${t.name} skips redundant joins.`);
        }
        add({ group: "join", name: "Already in biome?", status: "pass", detail: fresh && inBiome ? `In ${inBiome}, but "fresh" or "start" lets it join.` : `No account is in ${formatBiomes(list)}.` });
    } else {
        add({ group: "join", name: "Already in biome?", status: "info", detail: `${t.name} doesn't skip redundant joins.` });
    }

    const mode = settings.store.linkVerification;
    if (hasBypass(t, "bypassLinkVerification")) add({ group: "join", name: "Link check", status: "info", detail: `${t.name} skips link checks.` });
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
    return done("join", `Would join ${t.name}`, mode === "before" && !hasBypass(t, "bypassLinkVerification") && link.type !== "joinguard"
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
    if (!hasBypass(t, "bypassForwardIgnoredGuilds") && parseCsv(settings.store.forwardIgnoredGuilds).has(guild.id)) return { status: "info", detail: "This server is in \"Never forward from these servers\"." };
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
