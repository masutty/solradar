/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../settings";
import rawDefaults from "../triggers.json";
// Types only: TriggerStore imports this file at runtime
import type { Trigger } from "./TriggerStore";

// No JSX, webpack access or settings.store reads at module top level (see .superpowers/LESSONS.md)

// --- Data ---

export type DefaultTrigger = Trigger & { rev: number; };

/** Bump a default's `rev` in triggers.json when its keywords or biome check change. */
export const DEFAULT_TRIGGERS = rawDefaults as unknown as DefaultTrigger[];

// Developer tab only, until the next reload. Kept apart from revs so nothing fake is ever saved.
const fakeUnseen = new Set<string>();
const fakeUpdatable = new Set<string>();

export function getDefault(id: string): DefaultTrigger | undefined {
    return DEFAULT_TRIGGERS.find(d => d.id === id);
}

export function isDefaultId(id: string): boolean {
    return DEFAULT_TRIGGERS.some(d => d.id === id);
}

/** The default revision this trigger was imported or last updated from. */
export function defaultRevOf(trigger: Trigger): number {
    return trigger.defaultRev ?? 1;
}

export function isUpdatable(trigger: Trigger): boolean {
    const def = getDefault(trigger.id);
    return !!def && (defaultRevOf(trigger) < def.rev || fakeUpdatable.has(def.id));
}

/** Takes the default's name, icon, type, keywords and biome keyword. Everything else stays as the user set it. */
export function applyDefaultUpdate(mine: Trigger, def: DefaultTrigger): Trigger {
    fakeUpdatable.delete(def.id);
    return {
        ...mine,
        name: def.name,
        description: def.description,
        iconUrl: def.iconUrl,
        type: def.type,
        conditions: {
            ...mine.conditions,
            keywords: def.conditions.keywords,
        },
        biome: mine.biome && {
            ...mine.biome,
            detectionKeyword: def.biome?.detectionKeyword ?? mine.biome.detectionKeyword,
        },
        defaultRev: def.rev,
    };
}

const sameKeywords = (a: Trigger["conditions"]["keywords"], b: Trigger["conditions"]["keywords"]) =>
    JSON.stringify(a) === JSON.stringify(b);

/** What an update would change in the user's copy, worked out from the data, e.g. "Updates its keywords and icon." */
export function describeUpdate(mine: Trigger, def: DefaultTrigger): string {
    const parts: string[] = [];
    if (mine.name !== def.name) parts.push("name");
    if (mine.description !== def.description) parts.push("description");
    if (mine.iconUrl !== def.iconUrl) parts.push("icon");
    if (mine.type !== def.type) parts.push("type");
    if (!sameKeywords(mine.conditions.keywords, def.conditions.keywords)) parts.push("keywords");
    if (mine.biome && def.biome && mine.biome.detectionKeyword !== def.biome.detectionKeyword) parts.push("biome keyword");

    if (parts.length === 0) return "Updates it to the latest default.";
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
    return `Updates its ${list}.`;
}

// --- Seen state ---

function readSeen(): Record<string, number> {
    const seen = settings.store.defaultsSeen ?? {};
    if (Object.keys(seen).length > 0) {
        // TODO: temporary, remove with adoptDefaultIds. Revs only go up, so a value above today's rev was saved by an old fake: bring it back down
        const stale = DEFAULT_TRIGGERS.filter(d => (seen[d.id] ?? 0) > d.rev);
        if (stale.length === 0) return seen;
        const fixed = { ...seen };
        for (const d of stale) fixed[d.id] = d.rev;
        settings.store.defaultsSeen = fixed;
        return fixed;
    }

    // First read: what exists today is not news
    const baseline = currentRevs();
    settings.store.defaultsSeen = baseline;
    return baseline;
}

function currentRevs(): Record<string, number> {
    return Object.fromEntries(DEFAULT_TRIGGERS.map(d => [d.id, d.rev]));
}

export function markDefaultsSeen(): void {
    fakeUnseen.clear();
    settings.store.defaultsSeen = currentRevs();
}

export interface DefaultChanges {
    /** Unseen defaults the user does not have */
    added: DefaultTrigger[];
    /** Unseen defaults the user has and can update */
    updated: DefaultTrigger[];
}

export function pendingChanges(triggers: Trigger[]): DefaultChanges {
    const seen = readSeen();
    const mine = new Map(triggers.map(t => [t.id, t]));
    const changes: DefaultChanges = { added: [], updated: [] };

    for (const def of DEFAULT_TRIGGERS) {
        if ((seen[def.id] ?? 0) >= def.rev && !fakeUnseen.has(def.id)) continue;
        const own = mine.get(def.id);
        if (!own) changes.added.push(def);
        else if (isUpdatable(own)) changes.updated.push(def);
    }

    return changes;
}

export function countChanges(c: DefaultChanges): number {
    return c.added.length + c.updated.length;
}

// --- Developer tab ---

/** Makes two defaults the user has look updated and two they don't look new, so the nudge and the picker have something to show. */
export function fakeDefaultChanges(triggers: Trigger[]): string[] {
    const seen = readSeen();
    const owned = new Set(triggers.map(t => t.id));
    const picks = [
        ...DEFAULT_TRIGGERS.filter(d => owned.has(d.id)).slice(0, 2),
        ...DEFAULT_TRIGGERS.filter(d => !owned.has(d.id)).slice(0, 2),
    ];
    for (const d of picks) {
        fakeUnseen.add(d.id);
        if (owned.has(d.id)) fakeUpdatable.add(d.id);
    }
    // A new object makes the Triggers tab read the changes again
    settings.store.defaultsSeen = { ...seen };
    return picks.map(d => d.name);
}

export function clearFakeDefaultChanges(): void {
    fakeUpdatable.clear();
    markDefaultsSeen();
}
