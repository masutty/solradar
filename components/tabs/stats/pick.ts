/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface PickTrigger { name: string; iconUrl?: string; }
export interface PickGroup { folder: { id: string; name: string; } | null; triggers: PickTrigger[]; }
/** A set of trigger names, or null for all triggers */
export type Selection = ReadonlySet<string> | null;

/** Folders (non-empty) and loose triggers in display order; loose triggers are grouped as runs under folder: null */
export function pickGroups(
    triggers: { id: string; name: string; iconUrl?: string; folderId?: string; }[],
    folders: { id: string; name: string; }[],
    layout: string[]
): PickGroup[] {
    const groups: PickGroup[] = [];
    for (const id of layout) {
        const folder = folders.find(f => f.id === id);
        if (folder) {
            const inside = triggers.filter(t => t.folderId === id);
            if (inside.length) groups.push({ folder: { id: folder.id, name: folder.name }, triggers: inside.map(t => ({ name: t.name, iconUrl: t.iconUrl })) });
            continue;
        }
        const t = triggers.find(x => x.id === id);
        if (!t) continue;
        const last = groups[groups.length - 1];
        const item = { name: t.name, iconUrl: t.iconUrl };
        if (last && last.folder === null) last.triggers.push(item);
        else groups.push({ folder: null, triggers: [item] });
    }
    return groups;
}

// With no selection only "All triggers" is ticked, so picking a folder or trigger starts a selection of just that
export function tickState(sel: Selection, names: string[]): "on" | "part" | "off" {
    const ticked = sel === null ? 0 : names.filter(n => sel.has(n)).length;
    return ticked === 0 ? "off" : ticked === names.length ? "on" : "part";
}

export function toggleNames(sel: Selection, names: string[], all: string[]): Selection {
    const next = new Set(sel ?? []);
    const on = tickState(next, names) === "on";
    for (const n of names) {
        if (on) next.delete(n);
        else next.add(n);
    }
    return next.size === 0 || (next.size === all.length && all.every(n => next.has(n))) ? null : next;
}
