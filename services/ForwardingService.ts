/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "../logger";
import { Snipe } from "../models/Snipe";
import { settings } from "../settings";
import { isLocalIcon, resolveIcon } from "../stores/IconStore";
import { hasBiomeStatus } from "../stores/TriggerStore";
import { parseCsv, sendWebhook } from "../utils";
import { buildForwardPayload, ForwardKind, ICON_ATTACHMENT } from "./forwardMessage";

const logger = new Logger("SolRadar:Forwarding");

export type { ForwardKind };

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

    const { trigger } = snipe;
    const webhookUrl = trigger.forwarding.webhookUrl || settings.store.globalWebhookUrl;
    const isCard = trigger.forwarding.format === "card";

    // A local icon has no public link, so it travels as an attachment
    const localIcon = isLocalIcon(trigger.iconUrl) ? resolveIcon(trigger.iconUrl) : undefined;

    const build = (withLocalIcon: boolean) => buildForwardPayload({
        forwarding: trigger.forwarding,
        kind,
        triggerName: trigger.name,
        triggerType: trigger.type,
        iconRef: withLocalIcon ? ICON_ATTACHMENT : localIcon ? undefined : trigger.iconUrl || undefined,
        hasBiome: hasBiomeStatus(trigger),
        senderId: snipe.message.author.id,
        senderName: snipe.message.author.username,
        serverLink: snipe.link.link,
        jumpUrl: `https://discord.com/channels/${snipe.guild.id}/${snipe.channel.id}/${snipe.message.id}`,
        guildName: snipe.guild.name,
        guildId: snipe.guild.id,
        channelId: snipe.channel.id,
        channelName: snipe.channel.name,
        userMessage: snipe.getRawMessageContent(),
        sentAt: Math.floor(Date.now() / 1000),
        censor: settings.store.censorWebhooks,
    });

    const send = async (withLocalIcon: boolean) => {
        const { body, components } = build(withLocalIcon);
        await sendWebhook(components ? withComponents(webhookUrl) : webhookUrl, JSON.stringify(body), withLocalIcon ? localIcon : undefined);
    };

    try {
        try {
            await send(Boolean(localIcon));
        } catch (err) {
            // Discord may refuse a file next to a card. Try again without the icon rather than losing the forward.
            if (!(isCard && localIcon)) throw err;
            logger.warn(`[${trigger.name}] Forward with the local icon failed, retrying without it: ${(err as Error).message}`);
            await send(false);
        }
        logger.info(`[${trigger.name}] Forward successful (${kind}).`);
        snipe.logInfo(`Forwarded (${kind}).`);
    } catch (err) {
        const { message } = (err as Error);
        logger.error(`[${trigger.name}] Forward failed: ${message}`);
        snipe.logError(`Forward failed: ${message}`);
    }
}

/** Webhooks that do not belong to an app only send components when the URL asks for them */
function withComponents(url: string): string {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set("with_components", "true");
        return parsed.toString();
    } catch {
        return url;
    }
}
