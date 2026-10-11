/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "../logger";
import { Snipe } from "../models/Snipe";
import { settings } from "../settings";
import { parseCsv, sendWebhook } from "../utils";

const logger = new Logger("SolRadar:Forwarding");

export type ForwardKind = "match" | "detection";

export function canForward(snipe: Snipe): boolean {
    if (!settings.store.forwardingEnabled) {
        snipe.logInfo("Forward skipped: forwarding is off in Settings.");
        return false;
    }

    const webhookUrl = snipe.trigger.forwarding.webhookUrl || settings.store.globalWebhookUrl;
    if (!webhookUrl) {
        logger.warn(`[${snipe.trigger.name}] Forwarding enabled but no webhook URL configured (trigger or global).`);
        snipe.logWarn("Forward skipped: no webhook URL configured.");
        return false;
    }

    const excludedGuilds = snipe.trigger.forwarding.excludedGuilds ?? [];
    if (excludedGuilds.includes(snipe.guild.id)) {
        logger.info(`[${snipe.trigger.name}] Skipping forward: guild ${snipe.guild.id} is excluded.`);
        snipe.logInfo(`Forward skipped: guild "${snipe.guild.name}" is excluded.`);
        return false;
    }

    const excludedChannels = snipe.trigger.forwarding.excludedChannels ?? [];
    if (excludedChannels.includes(snipe.channel.id)) {
        logger.info(`[${snipe.trigger.name}] Skipping forward: channel ${snipe.channel.id} is excluded.`);
        snipe.logInfo(`Forward skipped: channel "#${snipe.channel.name}" is excluded.`);
        return false;
    }

    const bypassForwardIgnoredGuilds = snipe.trigger.conditions?.bypassForwardIgnoredGuilds ?? false;
    if (!bypassForwardIgnoredGuilds) {
        const ignoredGuilds = parseCsv(settings.store.forwardIgnoredGuilds);
        if (ignoredGuilds.has(snipe.guild.id)) {
            logger.info(`[${snipe.trigger.name}] Skipping forward: guild ${snipe.guild.id} is globally ignored.`);
            snipe.logInfo(`Forward skipped: guild "${snipe.guild.name}" is globally ignored.`);
            return false;
        }
    }

    return true;
}

export async function forwardSnipe(snipe: Snipe, kind: ForwardKind = "match"): Promise<void> {
    if (!canForward(snipe)) return;

    const webhookUrl = snipe.trigger.forwarding.webhookUrl || settings.store.globalWebhookUrl;
    const isDetection = kind === "detection";
    const hasBiome = snipe.trigger.type !== "MERCHANT";
    const censor = settings.store.censorWebhooks;

    const customMessageContent = snipe.trigger.forwarding.webhookContent;
    const customEmbedDescription = snipe.trigger.forwarding.webhookEmbedDescription;

    const serverLink = `[🔗 Server Link](${snipe.link.link})`;
    const embedDescription = customEmbedDescription
        ? `${customEmbedDescription}\n${serverLink}`
        : serverLink;

    const body = JSON.stringify({
        content: customMessageContent || null,
        embeds: [{
            title: isDetection
                ? `✅ ${snipe.trigger.name}: Biome Confirmed`
                : `🎯 ${snipe.trigger.name} (click to join)`,
            description: embedDescription,
            url: snipe.link.link,
            thumbnail: { url: snipe.trigger.iconUrl ?? undefined },
            fields: [
                {
                    name: "Sent by",
                    value: censor ? "```[REDACTED]```" : `<@${snipe.message.author.id}>`,
                    inline: true
                },
                {
                    name: "Sent in",
                    value: censor
                        ? "```[REDACTED]```"
                        : `https://discord.com/channels/${snipe.guild.id}/${snipe.channel.id}/${snipe.message.id}`,
                    inline: true
                },
                ...(hasBiome ? [{
                    name: "Biome",
                    value: isDetection ? "```✅ Verified```" : "```⚠️ Not verified```",
                    inline: false
                }] : []),
            ],
            color: isDetection ? 0x57f287 : 0x5865f2,
            timestamp: new Date().toISOString(),
            footer: { text: "SolRadar" },
        }],
    });

    try {
        await sendWebhook(webhookUrl, body);
        logger.info(`[${snipe.trigger.name}] Forward successful (${kind}).`);
        snipe.logInfo(`Forwarded (${kind}).`);
    } catch (err) {
        const { message } = (err as Error);
        logger.error(`[${snipe.trigger.name}] Forward failed: ${message}`);
        snipe.logError(`Forward failed: ${message}`);
    }
}
