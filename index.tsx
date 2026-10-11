/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Channel, Guild, Message } from "@vencord/discord-types";
import { ChannelType } from "@vencord/discord-types/enums";
import { ChannelStore, GuildStore } from "@webpack/common";
import { PropsWithChildren } from "react";

import { SolsRadarIcon } from "./components/icons/SolsRadarIcon";
import { SolsRadarChatBarButton } from "./components/ui/buttons/SolsRadarChatBarButton";
import { SolsRadarTitleBarButton } from "./components/ui/buttons/SolsRadarTitleBarButton";
import { pruneKnownNames } from "./components/ui/idFilter/pruneKnownNames";
import { openMessageDebugModal } from "./components/ui/MessageDebugModal";
import { Logger } from "./logger";
import { Snipe } from "./models/Snipe";
import { BiomeDetector } from "./services/BiomeDetector";
import { cancelBiomeDetection } from "./services/BiomeWatcher";
import { forwardSnipe } from "./services/ForwardingService";
import { isJoinLocked, join, shouldJoin } from "./services/JoinService";
import { flattenEmbeds, getSnipableLink, isMessageAllowed, isValidMessage, resolveTrigger, sanitizeContent } from "./services/MessageProcessor";
import { canNotify, notify } from "./services/NotificationService";
import { isDuplicateLink, markAsSeen } from "./services/SnipeDeduplicator";
import { settings } from "./settings";
import { ActiveChannelStore } from "./stores/ActiveChannelStore";
import { SnipeMetrics } from "./types";
import { ensureDailyVersionCheck, getCurrentVersion } from "./utils";

const logger = new Logger("SolRadar");

export interface JoinResult {
    joined: boolean;
    metrics: SnipeMetrics | null;
    linkSafe: boolean | undefined;
}

// --- Orchestration ---

async function handleMessage(message: Message, channel: Channel, guild: Guild, tMessageReceived: number): Promise<void> {
    if (!isValidMessage(message)) return;
    ActiveChannelStore.registerMessage(channel, guild);

    flattenEmbeds(message);
    const link = getSnipableLink(message.content);
    if (!link) return;
    logger.debug(`#${channel.name} @ ${guild.name} | ${link.type.toUpperCase()} ${link.code}`);
    ActiveChannelStore.registerLink(channel, guild, link);
    sanitizeContent(message);

    const trigger = resolveTrigger({ message, channel, guild });
    if (!trigger) return;

    logger.info(`Match: "${trigger.name}" (p${trigger.state.priority}) in #${channel.name} @ ${guild.name}`);

    if (!isMessageAllowed({ channel, message, trigger })) return;
    if (isJoinLocked(trigger)) return;

    const snipe = Snipe.create(message, link, trigger, channel, guild, tMessageReceived);
    snipe.logDebug("-- Snipe created! --");

    if (isDuplicateLink(snipe)) return;

    if (snipe.trigger.forwarding.onMatch.enabled && snipe.trigger.forwarding.onMatch.early) {
        snipe.logInfo("Forwarding early...");
        await forwardSnipe(snipe, "match");
    }

    if (shouldJoin(snipe)) await join(snipe);
    if (canNotify(snipe)) notify(snipe);

    if (snipe.trigger.forwarding.onMatch.enabled && !snipe.trigger.forwarding.onMatch.early) {
        snipe.logInfo("Forwarding late...");
        await forwardSnipe(snipe, "match");
    }

    markAsSeen(snipe);
}

// --- Plugin ---

export default definePlugin({
    name: "SolRadar",
    description: "Does Sols RNG stuff",
    version: getCurrentVersion(),
    authors: [{ name: "masutty", id: 188851299255713792n }],
    settings,

    patches: [
        {
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=trailing:.{0,50})\i\.Fragment,(?=\{children:\[)/,
                replace: "$self.TitlebarWrapper,"
            },
            predicate: () => settings.store.pluginIconLocation === "titlebar",
        }
    ],

    TitlebarWrapper({ children }: PropsWithChildren) {
        logger.debug("TitlebarWrapper");
        return (
            <>
                {children}
                <ErrorBoundary noop>
                    <SolsRadarTitleBarButton />
                </ErrorBoundary>
            </>
        );
    },

    chatBarButton: {
        icon: SolsRadarIcon,
        render: SolsRadarChatBarButton,
    },

    messagePopoverButton: {
        icon: SolsRadarIcon,
        render(msg) {
            if (!settings.store.showMessageDebugButton) return null;
            const channel = ChannelStore.getChannel(msg.channel_id);
            if (!channel || channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return null;
            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return null;

            return {
                label: "Debug with SolRadar",
                icon: SolsRadarIcon,
                message: msg,
                channel,
                onClick: () => openMessageDebugModal(msg, channel, guild),
            };
        },
    },

    async start() {
        logger.info("Starting");

        void ensureDailyVersionCheck();
        pruneKnownNames().catch(err => logger.error("Failed to prune known names:", err));

        if (settings.store.detectorEnabled) {
            const accounts = (settings.store.detectorAccounts as string ?? "")
                .split(",").map(s => s.trim()).filter(Boolean);

            if (accounts.length) {
                await BiomeDetector.configure(accounts);
                BiomeDetector.start(settings.store.detectorIntervalMs ?? 1_000);
            } else {
                logger.info("Biome detector enabled but no accounts configured.");
            }
        }
    },

    stop() {
        logger.info("Stopping");
        BiomeDetector.stop();
        cancelBiomeDetection();
    },

    flux: {
        async MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic: boolean; }) {
            const tMessageReceived = performance.now();
            if (optimistic) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return;
            if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return;

            await handleMessage(message, channel, guild, tMessageReceived);
        }
    }
});
