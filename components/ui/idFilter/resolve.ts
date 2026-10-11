/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, GuildRoleStore, GuildStore, UserStore } from "@webpack/common";

import { KnownNamesStore } from "./KnownNamesStore";
import { IdLookup, isDeletedUser } from "./lookup";
import { BAD_STATES, ChipKind, RowView } from "./types";

// Turns a saved ID into what its row shows. Reads Discord's memory only, never the API.

export function guildIconUrl(guild: { id: string; icon?: string | null; }) {
    return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=32` : undefined;
}

export function userAvatarUrl(user: any): string | undefined {
    try { return user.getAvatarURL?.(undefined, 32) ?? undefined; } catch { return undefined; }
}

export function userDisplayName(user: { username: string; globalName?: string | null; }) {
    return user.globalName || user.username;
}

/** Finds a role in any server you are in, trying the remembered server first. */
export function findRole(id: string, hintGuildId?: string): { role: any; guildId: string; } | null {
    if (hintGuildId) {
        const role = GuildRoleStore.getRole(hintGuildId, id);
        if (role) return { role, guildId: hintGuildId };
    }
    for (const guildId of Object.keys(GuildStore.getGuilds())) {
        const role = GuildRoleStore.getRole(guildId, id);
        if (role) return { role, guildId };
    }
    return null;
}

export function resolveRow(kind: ChipKind, id: string, fallbackName?: string): RowView {
    const known = KnownNamesStore.get(id);
    const prefix = kind === "channel" ? "#" : kind === "role" ? "@" : "";
    const lastName = known?.name ?? fallbackName;
    const remembered = (state: RowView["state"]): RowView => ({
        id, kind, state,
        name: lastName ? prefix + lastName : null,
        sub: known?.guildName,
    });

    if (kind === "guild") {
        const guild = GuildStore.getGuild(id);
        if (!guild) return remembered("notInServer");
        KnownNamesStore.remember(id, { name: guild.name });
        return { id, kind, state: "ok", name: guild.name, iconUrl: guildIconUrl(guild) };
    }

    if (kind === "channel") {
        const channel = ChannelStore.getChannel(id);
        if (channel) {
            const guild = channel.guild_id ? GuildStore.getGuild(channel.guild_id) : null;
            const name = channel.name || "unnamed";
            KnownNamesStore.remember(id, { name, guildId: guild?.id, guildName: guild?.name });
            return { id, kind, state: "ok", name: "#" + name, sub: guild?.name, iconUrl: guild ? guildIconUrl(guild) : undefined };
        }
        const result = IdLookup.result(id);
        if (result === "deleted") return remembered("deleted");
        if (result === "noAccess") return remembered("noAccess");
        if (IdLookup.isPending(id)) return remembered("checking");
        // Discord confirmed it exists but hasn't put it in memory (e.g. a channel from a server you're not in)
        if (result === "found") return remembered("ok");
        if (known?.guildId) {
            // Discord loads every channel of the servers you are in, hidden ones included.
            // So a channel missing from a server you are still in was deleted.
            return remembered(GuildStore.getGuild(known.guildId) ? "deleted" : "notInServer");
        }
        return remembered("notLoaded");
    }

    if (kind === "user") {
        const user = UserStore.getUser(id);
        if (user && !isDeletedUser(user)) {
            const name = userDisplayName(user);
            KnownNamesStore.remember(id, { name });
            return { id, kind, state: "ok", name, detail: "@" + user.username, iconUrl: userAvatarUrl(user) };
        }
        if (user || IdLookup.result(id) === "deleted") return remembered("deleted");
        if (IdLookup.isPending(id)) return remembered("checking");
        return remembered("notLoaded");
    }

    const found = findRole(id, known?.guildId);
    if (found) {
        const guildName = GuildStore.getGuild(found.guildId)?.name;
        KnownNamesStore.remember(id, { name: found.role.name, guildId: found.guildId, guildName });
        return { id, kind, state: "ok", name: "@" + found.role.name, sub: guildName, color: found.role.colorString ?? undefined };
    }
    if (known?.guildId) return remembered(GuildStore.getGuild(known.guildId) ? "deleted" : "notInServer");
    return remembered("notFound");
}

const RANK: Record<RowView["state"], number> = { notInServer: 0, deleted: 0, noAccess: 0, notFound: 0, notLoaded: 1, checking: 1, ok: 2 };

/** Problem rows first, otherwise the saved order. */
export function sortRows(rows: RowView[]) {
    return rows.map((r, i) => [r, i] as const).sort((a, b) => RANK[a[0].state] - RANK[b[0].state] || a[1] - b[1]).map(([r]) => r);
}

export const isBad = (r: RowView) => BAD_STATES.has(r.state);

export function sameRows(a: RowView[], b: RowView[]) {
    return a.length === b.length && a.every((r, i) => {
        const o = b[i];
        return r.id === o.id && r.state === o.state && r.name === o.name && r.sub === o.sub && r.iconUrl === o.iconUrl && r.color === o.color && r.detail === o.detail;
    });
}
