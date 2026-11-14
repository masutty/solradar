/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Which card and folder the triggers tour points at. Plain data in, ids out, so it can be checked without Discord.

interface TargetTrigger { id: string; }
interface TargetFolder { id: string; paused?: boolean; }

export type TargetItem<T extends TargetTrigger, F extends TargetFolder> =
    | { kind: "trigger"; trigger: T; }
    | { kind: "folder"; folder: F; triggers: T[]; open: boolean; };

/**
 * The first card the user can see, in list order. Cards in closed folders don't count.
 * A card outside a paused folder wins, since the tour shows its icon turning it on and off.
 */
export function pickTourCard<T extends TargetTrigger, F extends TargetFolder>(items: TargetItem<T, F>[]): string | null {
    let fallback: string | null = null;
    for (const item of items) {
        if (item.kind === "trigger") return item.trigger.id;
        if (!item.open || !item.triggers.length) continue;
        if (!item.folder.paused) return item.triggers[0].id;
        fallback ??= item.triggers[0].id;
    }
    return fallback;
}

/** The first folder in the list */
export function pickTourFolder<T extends TargetTrigger, F extends TargetFolder>(items: TargetItem<T, F>[]): string | null {
    for (const item of items) if (item.kind === "folder") return item.folder.id;
    return null;
}
