/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BypassKey, ScopeRules } from "../stores/TriggerStore";

export type Tier = Partial<ScopeRules>;
export type ScopeInput = {
    userId: string;
    channelId: string;
    guildId: string;
    global: Tier;
    folder?: Tier;
    trigger: Tier;
    bypass: (k: BypassKey) => boolean;
};
export type ScopeBlock = { tier: "global" | "folder" | "trigger"; list: keyof ScopeRules; };

const GLOBAL_NEVER_BYPASS: [keyof ScopeRules, BypassKey][] = [
    ["neverServers", "bypassIgnoredGuilds"],
    ["neverChannels", "bypassIgnoredChannels"],
    ["neverUsers", "bypassIgnoredUsers"],
];

const hasLocation = (t: Tier) => !!(t.onlyServers?.length || t.onlyChannels?.length);

export function scopeBlock(i: ScopeInput): ScopeBlock | null {
    const tiers = [["global", i.global], ["folder", i.folder ?? {}], ["trigger", i.trigger]] as const;

    const hits = (t: Tier, list: keyof ScopeRules) => {
        const id = list.endsWith("Servers") ? i.guildId : list.endsWith("Channels") ? i.channelId : i.userId;
        return !!t[list]?.includes(id);
    };

    for (const [tier, rules] of tiers) {
        for (const list of ["neverServers", "neverChannels", "neverUsers"] as const) {
            if (tier === "global" && i.bypass(GLOBAL_NEVER_BYPASS.find(([l]) => l === list)![1])) continue;
            if (hits(rules, list)) return { tier, list };
        }
    }

    const lowerLocation = hasLocation(i.folder ?? {}) || hasLocation(i.trigger);
    for (const [tier, rules] of tiers) {
        if (!hasLocation(rules)) continue;
        if (tier === "global" && (lowerLocation || i.bypass("bypassMonitoredOnly"))) continue;
        if (hits(rules, "onlyChannels") || hits(rules, "onlyServers")) continue;
        return { tier, list: rules.onlyChannels?.length ? "onlyChannels" : "onlyServers" };
    }

    const lowerUsers = !!(i.folder?.onlyUsers?.length || i.trigger.onlyUsers?.length);
    for (const [tier, rules] of tiers) {
        if (!rules.onlyUsers?.length) continue;
        if (tier === "global" && lowerUsers) continue;
        if (!hits(rules, "onlyUsers")) return { tier, list: "onlyUsers" };
    }

    return null;
}
