/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";

import { ImportedTrigger, parseTriggersFile } from "../../stores/TriggerStore";
import { Native } from "../../utils";

export const SHARE_MAX_BYTES = 1_000_000;

const CODE_BLOCK = /```(?:json)?\s*\n?([\s\S]*?)```/gi;

function tryParse(candidate: string): ImportedTrigger[] | null {
    const text = candidate.trim();
    if (!text.startsWith("[") || !text.includes('"conditions"')) return null;
    const result = parseTriggersFile(text, { adoptIcons: false });
    return result.ok ? result.triggers : null;
}

export function extractShare(text: string): ImportedTrigger[] | null {
    const whole = tryParse(text);
    if (whole) return whole;

    for (const match of text.matchAll(CODE_BLOCK)) {
        const found = tryParse(match[1]);
        if (found) return found;
    }
    return null;
}

export function shareSource(message: Message):
    | { kind: "text"; triggers: ImportedTrigger[]; }
    | { kind: "file"; url: string; fileName: string; }
    | null {
    const triggers = extractShare(message.content ?? "");
    if (triggers) return { kind: "text", triggers };

    const file = message.attachments?.find(a => /\.(txt|json)$/i.test(a.filename) && a.size <= SHARE_MAX_BYTES);
    return file ? { kind: "file", url: file.url, fileName: file.filename } : null;
}

const attachmentCache = new Map<string, Promise<ImportedTrigger[] | null>>();

export function loadAttachment(url: string): Promise<ImportedTrigger[] | null> {
    let cached = attachmentCache.get(url);
    if (!cached) {
        cached = Native.fetchAttachmentText(url).then(extractShare).catch(() => null);
        attachmentCache.set(url, cached);
    }
    return cached;
}
