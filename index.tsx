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
import { PendingActionStore } from "./services/ActionExecutor";
import { BiomeDetector } from "./services/BiomeDetector";
import { cancelBiomeDetection } from "./services/BiomeWatcher";
import { forwardSnipe } from "./services/ForwardingService";
import { GlitchCoreContext, handleGlitchCoreReply, isGlitchCoreCandidate, requestGlitchCoreLink } from "./services/GlitchCore";
import { isJoinLocked, join, shouldJoin } from "./services/JoinService";
import { recordSnipe, shouldProcessEdit, snipedTriggers } from "./services/MessageEditWatcher";
import { flattenEmbeds, getSnipableLink, isValidMessage, resolveTrigger, sanitizeContent } from "./services/MessageProcessor";
import { canNotify, notify } from "./services/NotificationService";
import { redactUserPath } from "./services/paths";
import { isDuplicateLink, markAsSeen } from "./services/SnipeDeduplicator";
import { settings } from "./settings";
import { ActiveChannelStore } from "./stores/ActiveChannelStore";
import { pruneIcons } from "./stores/IconStore";
import { SnipeStore } from "./stores/SnipeStore";
import { getTriggers, triggerStoreReady } from "./stores/TriggerStore";
import { SnipableLink, SnipeMetrics } from "./types";
import { ensureDailyVersionCheck, getCurrentVersion, Native } from "./utils";

const logger = new Logger("SolRadar");

export interface JoinResult {
    joined: boolean;
    metrics: SnipeMetrics | null;
    linkSafe: boolean | undefined;
}

// --- Orchestration ---

async function handleMessage(message: Message, channel: Channel, guild: Guild, tMessageReceived: number, fromEdit = false): Promise<void> {
    if (!isValidMessage(message)) return;
    ActiveChannelStore.registerMessage(channel, guild);

    flattenEmbeds(message);
    const link = getSnipableLink(message.content);
    // No link, but a button that makes the bot send one. It is only clicked once a trigger matches
    const needsClick = !link && settings.store.interpretGlitchCoreLinks && isGlitchCoreCandidate(message);
    if (!link && !needsClick) return;
    if (link) {
        logger.debug(`#${channel.name} @ ${guild.name} | ${link.type.toUpperCase()} ${link.code}`);
        ActiveChannelStore.registerLink(channel, guild, link);
    } else {
        logger.debug(`#${channel.name} @ ${guild.name} | GLITCH CORE (needs a click)`);
    }
    sanitizeContent(message);

    const trigger = resolveTrigger({ message, channel, guild });
    if (!trigger) return;

    // An edit that keeps the same biome (typo fix, "(ended)" added...) never makes a second snipe
    if (fromEdit && trigger.conditions.ignoreEdits) {
        logger.info(`Edit ignored: "${trigger.name}" only fires on new messages`);
        return;
    }
    const earlier = snipedTriggers(message.id);
    if (fromEdit && earlier.includes(trigger.name)) {
        logger.info(`Edit ignored: this message already made a "${trigger.name}" snipe`);
        return;
    }

    logger.info(`Match: "${trigger.name}" (p${trigger.state.priority}) in #${channel.name} @ ${guild.name}${fromEdit ? " (edited message)" : ""}`);

    if (isJoinLocked(trigger)) return;

    if (!link) {
        await requestGlitchCoreLink({ message, channel, guild, trigger, tMessageReceived });
        return;
    }

    await runSnipe({ message, channel, guild, trigger, tMessageReceived, link, fromEdit });
}

interface SnipeContext extends GlitchCoreContext {
    link: SnipableLink;
    fromEdit?: boolean;
    glitchCore?: { tClicked: number; tLinkReceived: number; };
}

// Everything from the moment the link is known. A Glitch Core link arrives later than its message,
// so it continues here with the original message, trigger and receive time.
async function runSnipe({ message, channel, guild, trigger, tMessageReceived, link, fromEdit, glitchCore }: SnipeContext): Promise<void> {
    const earlier = fromEdit ? snipedTriggers(message.id) : [];

    const snipe = Snipe.create(message, link, trigger, channel, guild, tMessageReceived, glitchCore);
    snipe.logDebug("-- Snipe created! --");
    recordSnipe(message.id, trigger.name);
    if (glitchCore) snipe.logInfo(`Got the link from Glitch Core ${((glitchCore.tLinkReceived - glitchCore.tClicked) / 1000).toFixed(1)}s after the click.`);
    if (fromEdit) {
        snipe.logInfo(earlier.length
            ? `Found in an edited message. Before the edit it matched: ${earlier.join(", ")}`
            : "Found in an edited message. Before the edit it matched no trigger");
    }

    if (isDuplicateLink(snipe)) return;

    // The pending action reacted to the old game, and it must not touch this snipe
    if (PendingActionStore.cancel()) snipe.logInfo("Cancelled the pending action because of this snipe.");

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

function onGlitchCoreLink(ctx: GlitchCoreContext, link: SnipableLink, glitchCore: { tClicked: number; tLinkReceived: number; }) {
    // Another join may have set the lock while the link was on its way
    if (isJoinLocked(ctx.trigger)) {
        logger.info(`Glitch Core link for "${ctx.trigger.name}" dropped: a join lock was set while waiting`);
        return;
    }
    runSnipe({ ...ctx, link, glitchCore }).catch(err => logger.error("Glitch Core snipe failed:", err));
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
        Promise.all([triggerStoreReady, SnipeStore.ready])
            .then(() => pruneIcons([...getTriggers().map(t => t.iconUrl), ...SnipeStore.all.map(e => e.iconUrl)]))
            .catch(err => logger.error("Failed to prune icons:", err));
        pruneKnownNames().catch(err => logger.error("Failed to prune known names:", err));

        // Join speed: read the Roblox handler now so the first snipe does not pay for it
        // Natives only reload with a full Discord restart, so this can be missing after Ctrl+R
        if (typeof Native.warmLaunchHandler === "function") {
            Native.warmLaunchHandler()
                .then(exe => logger.info(`Roblox handler: ${exe ? redactUserPath(exe) : "not found, joins will use the shell"}`))
                .catch(err => logger.error("Failed to read the Roblox handler:", err));
        } else {
            logger.warn("Native helpers are outdated. Fully restart Discord (quit from the tray) to load them.");
        }

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
            if (handleGlitchCoreReply(message, tMessageReceived, onGlitchCoreLink)) return;
            if (optimistic) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return;
            if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return;

            await handleMessage(message, channel, guild, tMessageReceived);
        },

        // Experimental: some people post the link first and add the biome in an edit
        async MESSAGE_UPDATE({ message }: { message: Message; }) {
            const tMessageReceived = performance.now();
            if (handleGlitchCoreReply(message, tMessageReceived, onGlitchCoreLink)) return;
            if (!settings.store.watchMessageEdits) return;
            if (!message?.id || !shouldProcessEdit(message)) return;

            const channel = ChannelStore.getChannel(message.channel_id);
            if (!channel) return;
            if (channel.type === ChannelType.DM || channel.type === ChannelType.GROUP_DM) return;

            const guild = GuildStore.getGuild(channel.guild_id!);
            if (!guild) return;

            // The pipeline rewrites content, so work on a copy and leave Discord's payload alone
            await handleMessage({ ...message } as Message, channel, guild, tMessageReceived, true);
        }
    }
});
