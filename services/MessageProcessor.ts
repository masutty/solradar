/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";

import { Logger } from "../logger";
import { settings } from "../settings";
import { getActiveTriggers, KeywordSet } from "../stores/TriggerStore";
import { SnipableLink, Trigger } from "../types";
import { extractComponentContent, parseCsv } from "../utils";
import { explainScope, FilterFix, hasBypass } from "./scope";

const logger = new Logger("SolRadar.MessageProcessor");

// --- Link extraction ---

// Every Roblox link format the plugin knows. Also used to strip links before keyword
// matching, so URL slugs like "Cyberspace" or "Blood-Rain" don't fire triggers.
const ROBLOX_LINK_PATTERN = /https?:\/\/(?:www\.)?roblox\.com\/(?:share\?code=[a-f0-9]+(?:&[^\s]*)?|games\/\d+(?:\/[^\s?]*)?(?:\?[^\s]*)?)/gi;
const SHARE_LINK_RE = /https?:\/\/(?:www\.)?roblox\.com\/share\?code=([a-f0-9]+)/i;
const PRIVATE_SERVER_RE = /https?:\/\/(?:www\.)?roblox\.com\/games\/(\d+)(?:\/[^?]*)?\?privateserverlinkcode=([a-f0-9]+)/i;
const JOINGUARD_RE = /https?:\/\/(?:www\.)?join-guard\.solsstattracker\.com\/([a-zA-Z0-9_]+)/i;

export function getSnipableLink(content: string): SnipableLink | null {
    if (!content?.trim()) return null;

    const normalized = content.trim();
    const shareMatch = SHARE_LINK_RE.exec(normalized);
    const privateMatch = PRIVATE_SERVER_RE.exec(normalized);
    const joinGuardMatch = JOINGUARD_RE.exec(normalized);

    const matches = [shareMatch, privateMatch, joinGuardMatch].filter(Boolean).length;

    if (matches === 0) return null;

    if (matches > 1 && !settings.store.resolveAmbiguousLinks) {
        logger.warn("Ambiguous message: multiple link types detected, skipping.");
        return null;
    }

    if (matches > 1) {
        const candidates: Array<{ index: number; result: SnipableLink; }> = [];
        if (shareMatch) candidates.push({ index: shareMatch.index, result: { type: "share", link: shareMatch[0] + "&type=Server", code: shareMatch[1] } });
        if (privateMatch) candidates.push({ index: privateMatch.index, result: { type: "private", link: privateMatch[0], code: privateMatch[2], placeId: privateMatch[1] } });
        if (joinGuardMatch && settings.store.interpretJoinguardLinks) candidates.push({ index: joinGuardMatch.index, result: { type: "joinguard", link: joinGuardMatch[0], code: joinGuardMatch[1] } });
        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.index - b.index);
        return candidates[0].result;
    }

    if (shareMatch) return { type: "share", link: shareMatch[0] + "&type=Server", code: shareMatch[1] };
    if (privateMatch) return { type: "private", link: privateMatch[0], code: privateMatch[2], placeId: privateMatch[1] };
    if (joinGuardMatch && settings.store.interpretJoinguardLinks) return { type: "joinguard", link: joinGuardMatch[0], code: joinGuardMatch[1] };

    return null;
}

export function stripSnipableLinks(content: string): string {
    return content.replace(ROBLOX_LINK_PATTERN, "").replace(/\s{2,}/g, " ").trim();
}

// --- Message pipeline ---

const IS_COMPONENTS_V2 = 1 << 15; // MessageFlags.IS_COMPONENTS_V2
const V2_LAYOUT_TYPES = new Set([9, 10, 17]); // section, text display, container

/** Components V2 messages have no content or embeds: their text and buttons live in components. */
export function isComponentsV2(message: Message): boolean {
    return ((message.flags ?? 0) & IS_COMPONENTS_V2) !== 0
        || (message.components as any[] | undefined)?.some(c => V2_LAYOUT_TYPES.has(c?.type)) === true;
}

export function flattenEmbeds(message: Message): void {
    if (!settings.store.flattenEmbeds) return;

    const components = (message.components ?? []) as any[];
    const v2 = components.length > 0 && isComponentsV2(message);
    if (!message.embeds.length && !v2) return;

    let flattened = message.content;

    // Components V2 always contribute their text and button links. Classic messages only add
    // button links with advanced flattening, as before.
    if (v2 || (settings.store.advancedEmbedFlattening && message.embeds.length && components.length)) {
        const { texts, urls } = extractComponentContent(components);
        if (v2) for (const text of texts) flattened += ` ${text}`;
        for (const url of urls) flattened += ` ${url}`;
    }

    for (const embed of message.embeds) {
        if (embed.type !== "rich") continue;

        // @ts-ignore flux events use title/description, the message store uses rawTitle/rawDescription
        const title = embed.rawTitle ?? embed.title;
        // @ts-ignore
        const description = embed.rawDescription ?? embed.description;
        if (title) flattened += ` ${title}`;
        if (description) flattened += ` ${description}`;

        if (settings.store.advancedEmbedFlattening) {
            if (embed.fields?.length) {
                for (const field of embed.fields) {
                    // @ts-ignore
                    const name = field.rawName ?? field.name;
                    // @ts-ignore
                    const value = field.rawValue ?? field.value;
                    if (name) flattened += ` ${name}`;
                    if (value) flattened += ` ${value}`;
                }
            }
        }
    }
    message.content = flattened;
    message.embeds = [];
}

export function sanitizeContent(message: Message): void {
    message.content = stripSnipableLinks(message.content);
}

// --- Message filters ---

/** A SolRadar card has no embed footer, so its mark is the last line of its last text: "-# ... SolRadar" */
function endsWithSolRadarMark(message: Message): boolean {
    const components = (message.components ?? []) as any[];
    if (!components.length) return false;
    const last = extractComponentContent(components).texts.at(-1)?.trim().split("\n").pop();
    return last?.toLowerCase().endsWith("solradar") === true;
}

export function invalidMessageReason(message: Message): "self-forward" | "reforward" | null {
    // @ts-ignore webhook_id is missing from the Message type
    const webhook_id = message.webhook_id ?? message.author.id ?? undefined;
    const isASelfForward = getActiveTriggers().some(t => {
        const url = t.forwarding.webhookUrl || settings.store.globalWebhookUrl;
        return url && webhook_id && url.includes(webhook_id);
    });
    if (isASelfForward) return "self-forward";

    const isReforward = message.embeds.some(e =>
        e.type === "rich" && (e as any).footer?.text?.toLowerCase() === "solradar"
    ) || endsWithSolRadarMark(message);
    if (isReforward && settings.store.ignoreWebhookForwards) return "reforward";

    return null;
}

export function isValidMessage(message: Message): boolean {
    const reason = invalidMessageReason(message);
    if (reason === "self-forward") logger.warn("This message is a self-forward!");
    if (reason === "reforward") logger.warn("This message is a re-forward! Protection against forward loops is enabled.");
    return reason === null;
}

// --- Trigger matching ---

function containsKeyword(text: string, keyword: string, strict: boolean): boolean {
    if (strict) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
}

export function firstKeyword(text: string, set: KeywordSet): string | undefined {
    return set.value.find(kw => containsKeyword(text, kw, set.strict));
}

export function findExcluded(text: string, conditions: Pick<Trigger["conditions"], "keywords" | "bypassGlobalExclude">): { word: string; global: boolean; } | null {
    const word = firstKeyword(text, conditions.keywords.exclude);
    if (word) return { word, global: false };

    if (!conditions.bypassGlobalExclude) {
        const globalWord = firstKeyword(text, { value: [...parseCsv(settings.store.globalExcludeKeywords)], strict: settings.store.globalExcludeStrict });
        if (globalWord) return { word: globalWord, global: true };
    }

    return null;
}

/** `via` says what made it match: a keyword, a role, or nothing (a trigger with no keywords). */
function evaluateTrigger(message: Message, trigger: Trigger): { matched: boolean; reason?: string; via?: string; globalExclude?: boolean; } {
    const { conditions } = trigger;
    const { content } = message;

    // message.mentionRoles is unreliable (often undefined), so parse role mentions from the content
    const mentionRoles = [...content.matchAll(/<@&(\d+)>/g)].map(m => m[1]);

    const hasKeywords = conditions.keywords.match.value.length > 0;
    const hasMentionRoles = conditions.mentionRoles.length > 0;

    let via: string | undefined;
    if (hasKeywords || hasMentionRoles) {
        const keyword = hasKeywords ? firstKeyword(content, conditions.keywords.match) : undefined;
        const role = hasMentionRoles ? conditions.mentionRoles.find(r => mentionRoles.includes(r.id)) : undefined;
        if (!keyword && !role)
            return { matched: false, reason: "no keyword or role in the message" };
        via = keyword ? `keyword "${keyword}"` : `role ${role!.label || role!.id}`;
    }

    const blocker = findExcluded(content, { ...conditions, bypassGlobalExclude: hasBypass(trigger, "bypassGlobalExclude") });
    if (blocker?.global)
        return { matched: false, reason: `global excluded keyword "${blocker.word}" is in the message`, globalExclude: true };
    if (blocker)
        return { matched: false, reason: `excluded keyword "${blocker.word}" is in the message` };

    return { matched: true, via };
}

export interface TriggerMatchResult {
    winner: Trigger | null;
    /** What made the winner match */
    via?: string;
    /** Normal triggers dropped because more than one matched */
    ambiguous: Trigger[];
    /** Every trigger whose conditions matched, before ambiguity and priority are applied */
    matched: Trigger[];
    /** Why each active trigger didn't match */
    rejected: { trigger: Trigger; reason: string; globalExclude?: boolean; filtered?: boolean; byUser?: boolean; fix?: FilterFix; }[];
}

export function explainTriggerMatch(message: Message, activeTriggers: Trigger[], ctx?: { channel: Channel; }): TriggerMatchResult {
    const filtered: TriggerMatchResult["rejected"] = [];
    const allowed = ctx ? activeTriggers.filter(t => {
        const blocked = explainScope(t, { channel: ctx.channel, message });
        if (blocked) filtered.push({ trigger: t, reason: blocked.reason, filtered: true, byUser: blocked.byUser, fix: blocked.fix });
        return !blocked;
    }) : activeTriggers;

    const results = allowed.map(t => ({ trigger: t, ...evaluateTrigger(message, t) }));
    const matched = results.filter(r => r.matched).map(r => r.trigger);
    const rejected = [
        ...filtered,
        ...results.filter(r => !r.matched).map(r => ({ trigger: r.trigger, reason: r.reason ?? "did not match", globalExclude: r.globalExclude })),
    ];

    const bypass = matched.filter(t => hasBypass(t, "bypassMatchAmbiguity"));
    const normals = matched.filter(t => !hasBypass(t, "bypassMatchAmbiguity"));
    const ambiguous = normals.length > 1 ? normals : [];

    const candidates = [...bypass, ...(normals.length === 1 ? normals : [])];
    candidates.sort((a, b) => a.state.priority - b.state.priority);

    const winner = candidates[0] ?? null;
    return { winner, via: results.find(r => r.trigger === winner)?.via, ambiguous, matched, rejected };
}

function getMatchingTrigger(message: Message, activeTriggers: Trigger[], channel: Channel): Trigger | null {
    const { winner, ambiguous, rejected } = explainTriggerMatch(message, activeTriggers, { channel });

    for (const r of rejected) {
        if (r.filtered) logger.debug(`[${r.trigger.name}] ${r.reason} Skipping.`);
    }

    if (ambiguous.length) {
        logger.warn(
            `Ambiguous: ${ambiguous.length} normal triggers matched: ` +
            ambiguous.map(t => `"${t.name}"`).join(", ") +
            ". Discarding all normal triggers."
        );
    }
    if (winner) logger.debug(`Winner: "${winner.name}" (p${winner.state.priority}, bypass=${hasBypass(winner, "bypassMatchAmbiguity")})`);

    return winner;
}

export function resolveTrigger(
    { message, channel, guild }: { message: Message; channel: Channel; guild: Guild; },
): Trigger | null {
    const activeTriggers = getActiveTriggers();
    if (!activeTriggers.length) return null;

    return getMatchingTrigger(message, activeTriggers, channel);
}
