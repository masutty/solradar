/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildChannelStore, GuildRoleStore, GuildStore, RelationshipStore, UserStore } from "@webpack/common";

import { guildIconUrl, resolveRow, userAvatarUrl, userDisplayName } from "./resolve";
import { ChipKind } from "./types";

// Search over what Discord already has in memory. Runs on every keystroke, so it must
// never touch the API.

export const MAX_RESULTS = 30;
const ID_RE = /^\d{17,20}$/;

export interface SearchResult {
    id: string;
    name: string;
    sub?: string;
    iconUrl?: string;
    color?: string;
    /** a pasted ID Discord doesn't have in memory */
    raw?: boolean;
}

interface Candidate extends SearchResult {
    haystack: string[];
    boost?: number;
}

export function isSnowflake(q: string) {
    return ID_RE.test(q.trim());
}

function guildCandidates(): Candidate[] {
    return Object.values(GuildStore.getGuilds()).map(g => ({ id: g.id, name: g.name, iconUrl: guildIconUrl(g), haystack: [g.name] }));
}

function channelCandidates(): Candidate[] {
    const out: Candidate[] = [];
    for (const guild of Object.values(GuildStore.getGuilds())) {
        const selectable = (GuildChannelStore.getChannels(guild.id) as any)?.SELECTABLE ?? [];
        for (const { channel } of selectable) {
            out.push({ id: channel.id, name: "#" + channel.name, sub: guild.name, iconUrl: guildIconUrl(guild), haystack: [channel.name, guild.name] });
        }
    }
    return out;
}

function userCandidates(): Candidate[] {
    const friends = new Set(RelationshipStore.getFriendIDs());
    return Object.values(UserStore.getUsers())
        .filter(u => !u.bot || friends.has(u.id))
        .map(u => ({
            id: u.id,
            name: userDisplayName(u),
            sub: u.globalName ? "@" + u.username : undefined,
            iconUrl: userAvatarUrl(u),
            haystack: [u.username, u.globalName ?? "", RelationshipStore.getNickname(u.id) ?? ""],
            boost: friends.has(u.id) ? 1 : 0,
        }));
}

function roleCandidates(): Candidate[] {
    const out: Candidate[] = [];
    for (const guild of Object.values(GuildStore.getGuilds())) {
        for (const role of GuildRoleStore.getSortedRoles(guild.id) ?? []) {
            if (role.id === guild.id) continue; // @everyone
            out.push({ id: role.id, name: "@" + role.name, sub: guild.name, color: role.colorString ?? undefined, haystack: [role.name, guild.name] });
        }
    }
    return out;
}

const CANDIDATES: Record<ChipKind, () => Candidate[]> = { guild: guildCandidates, channel: channelCandidates, user: userCandidates, role: roleCandidates };

export function searchIds(kind: ChipKind, query: string): SearchResult[] {
    const q = query.trim().toLowerCase();

    if (isSnowflake(q)) {
        const row = resolveRow(kind, q);
        if (row.state === "ok") return [{ id: q, name: row.name ?? q, sub: row.sub, iconUrl: row.iconUrl, color: row.color }];
        return [{ id: q, name: q, raw: true }];
    }

    const scored: [Candidate, number][] = [];
    for (const c of CANDIDATES[kind]()) {
        if (!q) { scored.push([c, (c.boost ?? 0)]); continue; }
        let best = -1;
        c.haystack.forEach((h, i) => {
            const idx = h.toLowerCase().indexOf(q);
            if (idx < 0) return;
            // The name itself beats the server name, and a prefix beats a match in the middle
            const score = (i === 0 ? 4 : 0) + (idx === 0 ? 2 : 0) + (c.boost ?? 0);
            best = Math.max(best, score);
        });
        if (best >= 0) scored.push([c, best]);
    }
    return scored
        .sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))
        .slice(0, MAX_RESULTS)
        .map(([c]) => ({ id: c.id, name: c.name, sub: c.sub, iconUrl: c.iconUrl, color: c.color }));
}
