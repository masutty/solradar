/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import { Logger } from "../logger";

const logger = new Logger("SolRadar:Icons");

const DATASTORE_KEY = "SolsRadar_Icons";
const PREFIX = "local:";
const SIZE = 64;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// A trigger's iconUrl is either a link or "local:<hash>", where the picture lives here.
// Snipes copy the iconUrl, so keeping the picture out of it keeps the history small.
let _icons: Record<string, string> = {};

const _ready: Promise<void> = (async () => {
    try {
        _icons = (await DataStore.get<Record<string, string>>(DATASTORE_KEY)) ?? {};
    } catch (e) {
        logger.error("Failed to load icons:", e);
    }
})();

export const iconStoreReady = _ready;

function persist(): void {
    DataStore.set(DATASTORE_KEY, _icons).catch(e => logger.error("Failed to persist icons:", e));
}

function hash(text: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0");
}

export const isLocalIcon = (iconUrl: string | undefined | null): iconUrl is string => !!iconUrl?.startsWith(PREFIX);

/** What to give an <img> or a notification: local icons become their picture, links stay as they are. */
export function resolveIcon(iconUrl: string | undefined): string | undefined {
    if (!isLocalIcon(iconUrl)) return iconUrl;
    return _icons[iconUrl.slice(PREFIX.length)];
}

/** Puts a picture in the store and returns the "local:" value for it. */
function storeIcon(dataUrl: string): string {
    const id = hash(dataUrl);
    if (_icons[id] !== dataUrl) {
        _icons[id] = dataUrl;
        persist();
    }
    return PREFIX + id;
}

/** Reads an image file, shrinks it to a small square and stores it. */
export async function saveIconFile(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
    if (file.size > MAX_FILE_BYTES) throw new Error("That image is bigger than 5 MB.");

    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SIZE;
        const side = Math.min(bitmap.width, bitmap.height);
        canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
        return storeIcon(canvas.toDataURL("image/webp", 0.85));
    } finally {
        bitmap.close();
    }
}

/** For export: a local icon is written out as its picture, so whoever imports the file gets it. */
export function inlineIcon(iconUrl: string): string {
    return resolveIcon(iconUrl) ?? "";
}

/** For import: a picture inside iconUrl goes into the store. Links are left alone. */
export function adoptIcon(iconUrl: string): string {
    return iconUrl.startsWith("data:image/") ? storeIcon(iconUrl) : iconUrl;
}

/** Drops pictures nothing points to anymore. */
export async function pruneIcons(inUse: Iterable<string | undefined>): Promise<void> {
    await _ready;
    const keep = new Set<string>();
    for (const url of inUse) if (isLocalIcon(url)) keep.add(url.slice(PREFIX.length));

    let removed = 0;
    for (const id of Object.keys(_icons)) {
        if (keep.has(id)) continue;
        delete _icons[id];
        removed++;
    }
    if (removed > 0) {
        logger.info(`Removed ${removed} unused icons.`);
        persist();
    }
}
