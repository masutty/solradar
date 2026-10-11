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

export function isValidMessage(message: Message): boolean {
    // @ts-ignore webhook_id is missing from the Message type
    const webhook_id = message.webhook_id ?? message.author.id ?? undefined;
    const isASelfForward = getActiveTriggers().some(t => {
        const url = t.forwarding.webhookUrl || settings.store.globalWebhookUrl;
        return url && webhook_id && url.includes(webhook_id);
    });

    if (isASelfForward) {
        logger.warn("This message is a self-forward!");
        return false;
    }

    const isReforward = message.embeds.some(e =>
        e.type === "rich" && (e as any).footer?.text?.toLowerCase() === "solradar"
    );

    if (isReforward && settings.store.ignoreWebhookForwards) {
        logger.warn("This message is a re-forward! Protection against forward loops is enabled.");
        return false;
    }

    return true;
}

/** Why a message is blocked for this trigger, or null when it passes. Same rules as isMessageAllowed. */
export function explainMessageBlocked(
    { channel, message, trigger }: { channel: Channel; message: Message; trigger: Trigger; },
): { reason: string; fix?: FilterFix; } | null {
    if (!trigger.conditions.bypassIgnoredGuilds && parseCsv(settings.store.ignoredGuilds).has(channel.guild_id))
        return { reason: "This server is in \"Always ignore these servers\" in Settings.", fix: { kind: "unignoreGuild", id: channel.guild_id } };

    if (trigger.conditions.ignoredGuilds.includes(channel.guild_id))
        return { reason: `${trigger.name} never fires in this server (its Filters).` };

    if (!trigger.conditions.bypassIgnoredChannels && parseCsv(settings.store.ignoredChannels).has(channel.id))
        return { reason: `#${channel.name} is in "Always ignore these channels" in Settings.`, fix: { kind: "unignoreChannel", id: channel.id } };

    if (trigger.conditions.ignoredChannels.includes(channel.id))
        return { reason: `${trigger.name} never fires in #${channel.name} (its Filters).` };

    if (parseCsv(settings.store.ignoredUsers).has(message.author.id))
        return { reason: `${message.author.username} is in "Always ignore these users" in Settings.`, fix: { kind: "unignoreUser", id: message.author.id } };

    if (!trigger.conditions.bypassMonitoredOnly) {
        const monitoredChannels = parseCsv(settings.store.monitoredChannels);
        const monitoredGuilds = parseCsv(settings.store.monitoredGuilds);
        const hasMonitors = monitoredChannels.size > 0 || monitoredGuilds.size > 0;
        if (hasMonitors && !monitoredChannels.has(channel.id) && !monitoredGuilds.has(channel.guild_id))
            return { reason: "This server and channel aren't in your \"Only monitor\" lists in Settings.", fix: { kind: "monitorGuild", id: channel.guild_id } };
    }

    return null;
}

export type FilterFix = { kind: "unignoreGuild" | "unignoreChannel" | "unignoreUser" | "monitorGuild"; id: string; };

export function isMessageAllowed(
    { channel, message, trigger }: { channel: Channel; message: Message; trigger: Trigger; },
): boolean {
    const blocked = explainMessageBlocked({ channel, message, trigger });
    if (blocked) logger.debug(`[${trigger.name}] ${blocked.reason} Skipping.`);
    return !blocked;
}

// --- Trigger matching ---

function containsKeyword(text: string, keyword: string, strict: boolean): boolean {
    if (strict) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`\\b${escaped}\\b`, "i").test(text);
    }
    return text.toLowerCase().includes(keyword.toLowerCase());
}

function firstKeyword(text: string, set: KeywordSet): string | undefined {
    return set.value.find(kw => containsKeyword(text, kw, set.strict));
}

/** `via` says what made it match: a keyword, a role, or nothing (a trigger with no keywords). */
function evaluateTrigger(message: Message, trigger: Trigger): { matched: boolean; reason?: string; via?: string; } {
    const { conditions } = trigger;
    const { content } = message;
    const authorId = message.author.id;
    const channelId = message.channel_id;

    // message.mentionRoles is unreliable (often undefined), so parse role mentions from the content
    const mentionRoles = [...content.matchAll(/<@&(\d+)>/g)].map(m => m[1]);

    if (conditions.fromUser.length > 0 && !conditions.fromUser.includes(authorId))
        return { matched: false, reason: "only fires for certain users" };

    if (conditions.inChannel.length > 0 && !conditions.inChannel.includes(channelId))
        return { matched: false, reason: "only fires in certain channels" };

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

    const excluded = firstKeyword(content, conditions.keywords.exclude);
    if (excluded)
        return { matched: false, reason: `excluded keyword "${excluded}" is in the message` };

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
    rejected: { trigger: Trigger; reason: string; }[];
}

export function explainTriggerMatch(message: Message, activeTriggers: Trigger[]): TriggerMatchResult {
    const results = activeTriggers.map(t => ({ trigger: t, ...evaluateTrigger(message, t) }));
    const matched = results.filter(r => r.matched).map(r => r.trigger);
    const rejected = results.filter(r => !r.matched).map(r => ({ trigger: r.trigger, reason: r.reason ?? "did not match" }));

    const bypass = matched.filter(t => t.conditions.bypassMatchAmbiguity);
    const normals = matched.filter(t => !t.conditions.bypassMatchAmbiguity);
    const ambiguous = normals.length > 1 ? normals : [];

    const candidates = [...bypass, ...(normals.length === 1 ? normals : [])];
    candidates.sort((a, b) => a.state.priority - b.state.priority);

    const winner = candidates[0] ?? null;
    return { winner, via: results.find(r => r.trigger === winner)?.via, ambiguous, matched, rejected };
}

function getMatchingTrigger(message: Message, activeTriggers: Trigger[]): Trigger | null {
    const { winner, ambiguous } = explainTriggerMatch(message, activeTriggers);

    if (ambiguous.length) {
        logger.warn(
            `Ambiguous: ${ambiguous.length} normal triggers matched: ` +
            ambiguous.map(t => `"${t.name}"`).join(", ") +
            ". Discarding all normal triggers."
        );
    }
    if (winner) logger.debug(`Winner: "${winner.name}" (p${winner.state.priority}, bypass=${winner.conditions.bypassMatchAmbiguity})`);

    return winner;
}

export function resolveTrigger(
    { message, channel, guild }: { message: Message; channel: Channel; guild: Guild; },
): Trigger | null {
    const activeTriggers = getActiveTriggers();
    if (!activeTriggers.length) return null;

    return getMatchingTrigger(message, activeTriggers);
}
