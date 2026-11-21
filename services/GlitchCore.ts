/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel, Guild, Message } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { UserStore } from "@webpack/common";

import { Logger } from "../logger";
import { settings } from "../settings";
import { GlitchCorePauseStore } from "../stores/GlitchCorePauseStore";
import { Trigger } from "../stores/TriggerStore";
import { SnipableLink } from "../types";
import { showToast } from "../utils";
import { getSnipableLink, TieBreak } from "./MessageProcessor";

// A "Glitch Core" message has no link, only a button that makes the bot reply with one, privately,
// after a countdown. Clicking it sends a request as the user, so every click goes through the guard below.

const logger = new Logger("SolRadar.GlitchCore");

const BUTTON_ID_PREFIX = "ultima:forward:server";
const COMPONENT_BUTTON = 2;

const NO_REPLY_MS = 10_000;
const NO_COUNTDOWN_WAIT_MS = 60_000;
const AFTER_COUNTDOWN_MS = 15_000;

// 4 clicks per minute at most
const MIN_GAP_MS = 15_000;
const PAUSE_MS = 10 * 60_000;

// Discord's own button click handler. It reports nothing back: success is the reply arriving.
const clickButton = findByCodeLazy("canQueueInteraction", "unarchiveThreadIfNecessary");

// --- Types ---

export interface GlitchCoreContext {
    message: Message;
    channel: Channel;
    guild: Guild;
    trigger: Trigger;
    tieBreak?: TieBreak;
    tMessageReceived: number;
}

interface PendingClick extends GlitchCoreContext {
    tClicked: number;
    replied: boolean;
    timer: ReturnType<typeof setTimeout>;
}

export type OnLink = (ctx: GlitchCoreContext, link: SnipableLink, times: { tClicked: number; tLinkReceived: number; }) => void;

// --- Detection ---

function findButton(message: Message): { customId: string; componentId: string; } | null {
    const rows = ((message as any).components ?? []) as any[];
    for (let row = 0; row < rows.length; row++) {
        const buttons = (rows[row]?.components ?? []) as any[];
        for (let index = 0; index < buttons.length; index++) {
            // Raw flux messages use custom_id, store messages use customId
            const customId = buttons[index]?.custom_id ?? buttons[index]?.customId;
            if (typeof customId === "string" && customId.startsWith(BUTTON_ID_PREFIX)) return { customId, componentId: `${row},${index}` };
        }
    }
    return null;
}

export function isGlitchCoreCandidate(message: Message): boolean {
    return !!message.author?.bot && findButton(message) !== null;
}

// --- Guard ---

const clickedMessages = new Set<string>();
let lastClickAt = 0;
const pending = new Map<string, PendingClick>();

const bypassed = () => settings.store.glitchCoreBypassClickLimits;

/** Why a click would be refused right now, as a phrase for "Missed X: ...", or null when it would go through. Changes nothing. */
export function whyNotClick(messageId?: string): string | null {
    if (messageId && clickedMessages.has(messageId)) return "this message was already clicked";
    if (bypassed()) return null;

    const paused = GlitchCorePauseStore.msRemaining();
    if (paused > 0) return `Glitch Core clicks are paused for ${Math.ceil(paused / 60_000)} more min`;
    if (Date.now() - lastClickAt < MIN_GAP_MS) return `the last Glitch Core click was less than ${MIN_GAP_MS / 1000}s ago`;
    return null;
}

function pauseClicks(cause: string) {
    if (bypassed()) return;
    GlitchCorePauseStore.start(cause, PAUSE_MS);
}

function drop(messageId: string) {
    const entry = pending.get(messageId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(messageId);
}

function missed(ctx: GlitchCoreContext, reason: string) {
    showToast({ text: `Missed ${ctx.trigger.name}: ${reason}`, variant: "critical" });
}

// --- Click ---

/** Clicks the button once the guard allows it, then waits for the replies (see handleGlitchCoreReply). */
export async function requestGlitchCoreLink(ctx: GlitchCoreContext): Promise<void> {
    const { message, channel, guild, trigger } = ctx;
    const button = findButton(message);
    if (!button) return;

    const refusal = whyNotClick(message.id);
    if (refusal) {
        logger.warn(`Skipped ${trigger.name} in #${channel.name}: ${refusal}`);
        // A message that was already clicked is not a missed snipe
        if (!clickedMessages.has(message.id)) missed(ctx, refusal);
        return;
    }

    clickedMessages.add(message.id);
    lastClickAt = Date.now();

    const tClicked = performance.now();
    pending.set(message.id, {
        ...ctx,
        tClicked,
        replied: false,
        timer: setTimeout(() => {
            drop(message.id);
            logger.warn(`${trigger.name}: The Core did not reply to the click`);
            pauseClicks("The Core didn't reply");
            missed(ctx, "The Core didn't reply");
        }, NO_REPLY_MS),
    });

    logger.info(`Clicking Get server link for ${trigger.name} in #${channel.name} @ ${guild.name}`);
    try {
        await clickButton({
            componentType: COMPONENT_BUTTON,
            messageId: message.id,
            messageFlags: message.flags ?? 0,
            customId: button.customId,
            componentId: button.componentId,
            applicationId: message.author.id,
            channelId: channel.id,
            guildId: guild.id,
        });
    } catch (err) {
        drop(message.id);
        const text = err instanceof Error ? err.message : String(err);
        logger.error(`The click failed for ${trigger.name}:`, err);
        pauseClicks(`the click failed: ${text}`);
        missed(ctx, `the click failed: ${text}`);
    }
}

// --- Reply ---

function timeoutLink(messageId: string) {
    const entry = pending.get(messageId);
    if (!entry) return;
    drop(messageId);
    logger.warn(`${entry.trigger.name}: The Core never sent the link`);
    missed(entry, "The Core never sent the link");
}

/**
 * Takes the bot's private replies to our clicks out of the pipeline. Returns true when the message was one,
 * so the caller stops. Calls onLink once, when a reply has the link.
 */
export function handleGlitchCoreReply(message: Message, tReceived: number, onLink: OnLink): boolean {
    const meta = (message as any)?.interaction_metadata;
    const originalId: string | undefined = meta?.interacted_message_id;
    if (!originalId || !clickedMessages.has(originalId)) return false;
    if (meta.user?.id !== UserStore.getCurrentUser()?.id) return false;

    // A reply that comes after the entry was dropped is stale, but must still not become a snipe
    const entry = pending.get(originalId);
    if (!entry) return true;

    const content = (message as any).content as string | undefined;

    if (!entry.replied) {
        entry.replied = true;
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => timeoutLink(originalId), NO_COUNTDOWN_WAIT_MS);
        logger.debug(`${entry.trigger.name}: The Core replied after ${Math.round(tReceived - entry.tClicked)}ms`);
    }

    const countdown = content && /<t:(\d+):R>/.exec(content);
    if (countdown) {
        clearTimeout(entry.timer);
        entry.timer = setTimeout(() => timeoutLink(originalId), Number(countdown[1]) * 1000 + AFTER_COUNTDOWN_MS - Date.now());
    }

    const link = content ? getSnipableLink(content) : null;
    if (link) {
        drop(originalId);
        onLink(entry, link, { tClicked: entry.tClicked, tLinkReceived: tReceived });
    }
    return true;
}
