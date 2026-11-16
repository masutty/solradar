/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Message } from "@vencord/discord-types";

import { settings } from "../settings";
import { BypassKey, getFolder } from "../stores/TriggerStore";
import { Trigger } from "../types";
import { parseCsv } from "../utils";
import { scopeBlock, scopeReason, Tier } from "./scopeRules";

export type FilterFix = { kind: "unignoreGuild" | "unignoreChannel" | "unignoreUser" | "monitorGuild"; id: string; };

export function hasBypass(t: Trigger, k: BypassKey): boolean {
    return !!(t.conditions[k] || getFolder(t.folderId)?.bypasses?.[k]);
}

function globalTier(): Tier {
    const s = settings.store;
    return {
        onlyServers: [...parseCsv(s.monitoredGuilds)],
        onlyChannels: [...parseCsv(s.monitoredChannels)],
        onlyUsers: [...parseCsv(s.monitoredUsers)],
        neverServers: [...parseCsv(s.ignoredGuilds)],
        neverChannels: [...parseCsv(s.ignoredChannels)],
        neverUsers: [...parseCsv(s.ignoredUsers)],
    };
}

function triggerTier(t: Trigger): Tier {
    const c = t.conditions;
    return {
        onlyServers: c.inGuild,
        onlyChannels: c.inChannel,
        onlyUsers: c.fromUser,
        neverServers: c.ignoredGuilds,
        neverChannels: c.ignoredChannels,
        neverUsers: c.ignoredUsers,
    };
}

export function explainScope(
    t: Trigger,
    { channel, message }: { channel: Channel; message: Message; },
): { reason: string; fix?: FilterFix; } | null {
    const folder = getFolder(t.folderId);
    const block = scopeBlock({
        userId: message.author.id,
        channelId: channel.id,
        guildId: channel.guild_id,
        global: globalTier(),
        folder: folder?.rules,
        trigger: triggerTier(t),
        bypass: k => hasBypass(t, k),
    });
    if (!block) return null;

    const user = message.author.username;

    if (block.tier === "global") {
        switch (block.list) {
            case "neverServers": return { reason: "This server is in \"Always ignore these servers\" in Settings.", fix: { kind: "unignoreGuild", id: channel.guild_id } };
            case "neverChannels": return { reason: `#${channel.name} is in "Always ignore these channels" in Settings.`, fix: { kind: "unignoreChannel", id: channel.id } };
            case "neverUsers": return { reason: `${user} is in "Always ignore these users" in Settings.`, fix: { kind: "unignoreUser", id: message.author.id } };
            case "onlyUsers": return { reason: `${user} isn't in "Only from these users" in Settings.` };
            default: return { reason: "This server and channel aren't in your \"Only monitor\" lists in Settings.", fix: { kind: "monitorGuild", id: channel.guild_id } };
        }
    }

    const owner = block.tier === "folder" ? `The ${folder!.name} folder` : t.name;
    return { reason: scopeReason(block, owner, channel.name, user) };
}
