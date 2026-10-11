/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild } from "@vencord/discord-types";

import { SnipableLink } from "../types";

export interface ActiveChannel {
    channelId: string;
    channelName: string;
    guildId: string;
    guildName: string;
    lastMessageAt: number;
    messageCount: number;
    lastLinkAt: number | null;
    lastLinkCode: string | null;
    lastLinkType: string | null;
    linkCount: number;
}

const _registry = new Map<string, ActiveChannel>();

export const ActiveChannelStore = {
    registerMessage(channel: Channel, guild: Guild): void {
        const existing = _registry.get(channel.id);
        _registry.set(channel.id, {
            channelId: channel.id,
            channelName: channel.name,
            guildId: guild.id,
            guildName: guild.name,
            lastMessageAt: Date.now(),
            messageCount: (existing?.messageCount ?? 0) + 1,
            lastLinkAt: existing?.lastLinkAt ?? null,
            lastLinkCode: existing?.lastLinkCode ?? null,
            lastLinkType: existing?.lastLinkType ?? null,
            linkCount: existing?.linkCount ?? 0,
        });
    },

    registerLink(channel: Channel, guild: Guild, link: SnipableLink): void {
        const existing = _registry.get(channel.id);
        const now = Date.now();
        _registry.set(channel.id, {
            channelId: channel.id,
            channelName: channel.name,
            guildId: guild.id,
            guildName: guild.name,
            lastMessageAt: existing?.lastMessageAt ?? now,
            messageCount: existing?.messageCount ?? 1,
            lastLinkAt: now,
            lastLinkCode: link.code,
            lastLinkType: link.type,
            linkCount: (existing?.linkCount ?? 0) + 1,
        });
    },

    getAll(): ActiveChannel[] {
        return [..._registry.values()].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
    },

    clear(): void {
        _registry.clear();
    },
};
