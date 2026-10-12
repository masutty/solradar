/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";

import { Logger } from "../logger";
import { settings } from "../settings";
import { parseCsv } from "../utils";

const logger = new Logger("EditWatcher");

/**
 * Edits on messages older than this are ignored. Covers "link only, biome added later"
 * edits, and keeps late edits like "<link> GLITCHED (ended)" from joining a dead server.
 */
const EDIT_WINDOW_MS = 60 * 1000;

const DISCORD_EPOCH = 1420070400000n;

interface Seen {
    createdAt: number;
    /** Triggers this message already made a snipe for. */
    triggers: Set<string>;
    lastEdit?: string;
}

const seen = new Map<string, Seen>();

function createdAt(messageId: string): number {
    return Number((BigInt(messageId) >> 22n) + DISCORD_EPOCH);
}

function entry(messageId: string): Seen {
    let e = seen.get(messageId);
    if (!e) {
        e = { createdAt: createdAt(messageId), triggers: new Set() };
        seen.set(messageId, e);
    }
    return e;
}

function prune() {
    const now = Date.now();
    for (const [id, e] of seen) if (now - e.createdAt > EDIT_WINDOW_MS) seen.delete(id);
}

/** The first "biome ended" word in the text, matched as a whole word and ignoring case. */
function endedKeyword(content: string): string | null {
    for (const word of parseCsv(settings.store.editEndedKeywords)) {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(content)) return word;
    }
    return null;
}

/** Remember that this message made a snipe for this trigger, so its edits don't make a second one. */
export function recordSnipe(messageId: string, triggerName: string): void {
    prune();
    entry(messageId).triggers.add(triggerName);
}

/** Triggers this message already made a snipe for. */
export function snipedTriggers(messageId: string): string[] {
    return [...(seen.get(messageId)?.triggers ?? [])];
}

/**
 * Whether a MESSAGE_UPDATE should go through the snipe pipeline.
 * Rejects link previews and other automatic updates, partial payloads, repeats
 * of the same edit, old messages and edits with a "biome ended" word.
 */
export function shouldProcessEdit(message: Message): boolean {
    const raw = message as any;
    // Link previews and other automatic updates have no edit time
    if (!raw.edited_timestamp) return false;
    // Partial payloads can't go through the pipeline
    if (typeof raw.content !== "string" || !raw.author || !Array.isArray(raw.embeds)) return false;

    const age = Date.now() - createdAt(message.id);
    if (age > EDIT_WINDOW_MS) return false;

    const e = entry(message.id);
    if (e.lastEdit === raw.edited_timestamp) return false;
    e.lastEdit = raw.edited_timestamp;

    const ended = endedKeyword(raw.content);
    if (ended) {
        logger.info(`Edit ignored, it says the biome ended ("${ended}")`);
        return false;
    }

    logger.debug(`Edited message ${message.id} (${Math.round(age / 1000)}s old), checking it again`);
    return true;
}
