/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import { Logger } from "../../../logger";

const logger = new Logger("SolRadar.KnownNames");
const STORAGE_KEY = "SolsRadar_knownNames";

// Last name seen for each filtered ID, so a deleted channel can still show "#old-name"
// instead of a bare ID. Also remembers the server of channels and roles, which is how
// "deleted" is told apart from "you left the server".
export interface KnownName {
    name: string;
    guildId?: string;
    guildName?: string;
}

let names: Record<string, KnownName> = {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const ready = DataStore.get<Record<string, KnownName>>(STORAGE_KEY)
    .then(stored => { names = { ...stored, ...names }; })
    .catch(err => logger.error("Failed to load known names:", err));

function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        DataStore.set(STORAGE_KEY, names).catch(err => logger.error("Failed to save known names:", err));
    }, 1_000);
}

export const KnownNamesStore = {
    get(id: string): KnownName | undefined {
        return names[id];
    },

    remember(id: string, entry: KnownName) {
        const old = names[id];
        if (old && old.name === entry.name && old.guildId === entry.guildId && old.guildName === entry.guildName) return;
        names[id] = entry;
        scheduleSave();
    },

    /** Drops every ID that no filter list uses anymore. */
    async prune(inUse: Set<string>) {
        await ready;
        const before = Object.keys(names).length;
        for (const id of Object.keys(names)) if (!inUse.has(id)) delete names[id];
        if (Object.keys(names).length !== before) scheduleSave();
    },
};
