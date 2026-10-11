/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";
import { UserStore } from "@webpack/common";

import { Logger } from "../logger";
import { buildJoinUri } from "../services/RobloxService";
import { SnipeStore } from "../stores/SnipeStore";
import { SnipableLink, SnipeMetrics, SnipeTag, Trigger } from "../types";

const logger = new Logger("SolRadar.Model/Snipe");

// --- Snipe ---
// Created when a message matches a trigger. Writes to its SnipeEntry in the store and
// holds the live objects (trigger, channel, guild, link) that are not saved.

export class Snipe {
    readonly id: number;
    readonly trigger: Trigger;
    readonly message: Message;
    readonly channel: Channel;
    readonly guild: Guild;
    readonly link: SnipableLink;
    readonly tMessageReceived: number;
    readonly messageContent: string = "";

    private constructor(
        id: number,
        trigger: Trigger,
        message: Message,
        channel: Channel,
        guild: Guild,
        link: SnipableLink,
        tMessageReceived: number,
    ) {
        this.id = id;
        this.message = message;
        this.trigger = trigger;
        this.channel = channel;
        this.guild = guild;
        this.link = link;
        this.tMessageReceived = tMessageReceived;
    }

    static create(
        message: Message,
        link: SnipableLink,
        trigger: Trigger,
        channel: Channel,
        guild: Guild,
        tMessageReceived: number,
    ): Snipe {
        const author = UserStore.getUser(message.author.id);

        const id = SnipeStore.add({
            triggerName: trigger.name,
            triggerType: trigger.type,
            triggerPriority: trigger.state.priority,
            iconUrl: trigger.iconUrl,
            authorName: message.author.username,
            authorAvatarUrl: author?.getAvatarURL?.() ?? undefined,
            authorId: message.author.id,
            channelName: channel.name,
            guildName: guild.name,
            guildId: guild.id,
            messageJumpUrl: `https://discord.com/channels/${guild.id}/${channel.id}/${message.id}`,
            processedMessageText: message.content,
            link: link.link,
            joinUri: buildJoinUri(link),
        });

        return new Snipe(id, trigger, message, channel, guild, link, tMessageReceived);
    }

    // --- Link ---

    markAsLinkSafe() { this._tag("link-verified-safe"); }
    markAsLinkUnsafe() { this._tag("link-verified-unsafe"); }
    markAsLinkNotVerified() { this._tag("link-not-verified"); }
    markAsIgnored() { this._tag("link-ignored"); }

    isSafe(): boolean {
        const tags = SnipeStore.getById(this.id)?.tags ?? [];
        return tags.includes("link-verified-safe");
    }

    // --- Biome ---

    markAsBiomeReal() { this._tag("biome-verified-real"); }
    markAsBiomeBait() { this._tag("biome-verified-bait"); }
    markAsBiomeTimeout() { this._tag("biome-verified-timeout"); }
    markAsBiomeNotVerified() { this._tag("biome-not-verified"); }
    markAsRedundantBiome() { this._tag("redundant-biome-ignored"); }
    markAsRedundancyBypassed() { this._tag("redundant-biome-bypassed"); }

    // --- Join ---

    markAsFailed() { this._tag("failed"); }

    setMetrics(metrics: SnipeMetrics) {
        SnipeStore.update(this.id, { metrics });
    }

    setJoinUri(uri: string) {
        SnipeStore.update(this.id, { joinUri: uri });
    }

    setBiomeDuration(durationMs: number) {
        logger.debug(`Setting biome duration to ${durationMs}`);
        SnipeStore.update(this.id, { biomeDurationMs: durationMs });
    }

    getJoinUri(): string | undefined {
        return SnipeStore.getById(this.id)?.joinUri;
    }

    getRawMessageContent(): string {
        return SnipeStore.getById(this.id)?.processedMessageText ?? "";
    }

    // --- Internals ---

    private _tag(...tags: SnipeTag[]) {
        SnipeStore.addTags(this.id, ...tags);
    }

    // --- Log ---

    log(message: string) { this._log("debug", message); }
    logInfo(message: string) { this._log("info", message); }
    logWarn(message: string) { this._log("warn", message); }
    logError(message: string) { this._log("error", message); }
    logDebug(message: string) { this._log("debug", message); }

    private _log(level: "info" | "warn" | "error" | "debug", message: string) {
        SnipeStore.appendLog(this.id, level, message);
    }
}
