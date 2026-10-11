/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../../../settings";
import { getTriggers, triggerStoreReady } from "../../../stores/TriggerStore";
import { KnownNamesStore } from "./KnownNamesStore";

const ID_SETTINGS = ["monitoredGuilds", "monitoredChannels", "ignoredGuilds", "ignoredChannels", "ignoredUsers", "forwardIgnoredGuilds"] as const;

/** Forgets remembered names of IDs that no setting or trigger uses anymore. */
export async function pruneKnownNames() {
    await triggerStoreReady;
    const inUse = new Set<string>();
    const add = (ids: string[] | undefined) => ids?.forEach(id => inUse.add(id));

    for (const key of ID_SETTINGS) {
        add(String(settings.store[key] ?? "").split(",").map(s => s.trim()).filter(Boolean));
    }
    for (const t of getTriggers()) {
        add(t.conditions.fromUser);
        add(t.conditions.inChannel);
        add(t.conditions.ignoredChannels);
        add(t.conditions.ignoredGuilds);
        add(t.conditions.mentionRoles.map(r => r.id));
        add(t.forwarding.excludedGuilds);
        add(t.forwarding.excludedChannels);
    }
    await KnownNamesStore.prune(inUse);
}
