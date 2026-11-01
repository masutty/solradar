/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { Logger } from "../logger";
import { Snipe } from "../models/Snipe";
import { settings } from "../settings";
import { JoinLockStore } from "../stores/JoinLockStore";
import { SnipableLink, SnipeMetrics, Trigger } from "../types";
import { getEffectiveKillTargets, Native, parseCsv } from "../utils";
import { executeAction } from "./ActionExecutor";
import { BiomeDetector } from "./BiomeDetector";
import { startBiomeDetection } from "./BiomeWatcher";
import { scheduleTimelineCapture } from "./JoinTimeline";
import { redactUserPath } from "./paths";
import { closeGame, getPlaceId } from "./RobloxService";

const logger = new Logger("SolRadar:Join");

// --- Types ---

type VerifyLinkResult =
    | { ok: true; placeId: string; }
    | { ok: false; reason: "no-token" | "place-not-allowed" | "resolve-failed"; detail?: string; };

type JoinServerResult =
    | { ok: true; metrics: SnipeMetrics; }
    | { ok: false; reason: "link-unsafe" | "no-uri" | "native-failed"; detail?: string; };

// --- Join lock ---

export function isJoinLocked(trigger: Trigger): boolean {
    return JoinLockStore.isBlocked(trigger.state.priority);
}

function activateJoinLock(snipe: Snipe): void {
    const { trigger } = snipe;
    if (!trigger.state.joinlock || trigger.state.joinlockDuration <= 0) return;

    const activated = JoinLockStore.activate(
        trigger.state.priority,
        trigger.state.joinlockDuration,
        trigger.name,
    );

    if (activated) {
        snipe.logInfo(`Join lock activated: priority ${trigger.state.priority}, duration ${trigger.state.joinlockDuration}s.`);
    } else {
        snipe.logInfo("Join lock not updated: existing lock has higher priority.");
    }
}

// --- Redundancy ---

function isRedundantJoin(snipe: Snipe): boolean {
    if (!snipe.trigger.biome?.skipRedundantJoin) return false;

    const expected = snipe.trigger.biome.detectionKeyword || snipe.trigger.name;
    if (!BiomeDetector.isAnyAccountInBiome(expected)) return false;

    const freshKeywords = parseCsv("start,fresh");
    if (freshKeywords.size > 0) {
        const content = snipe.getRawMessageContent().toLowerCase() ?? "";
        if ([...freshKeywords].some(kw => content.includes(kw.toLowerCase()))) {
            snipe.markAsRedundancyBypassed();
            snipe.logInfo("Redundant biome bypassed: fresh keyword detected in message.");
            return false;
        }
    }

    snipe.logWarn(`Redundant join skipped: already in biome "${expected}".`);
    return true;
}

export function shouldJoin(snipe: Snipe): boolean {
    if (!settings.store.autoJoinEnabled) {
        snipe.logInfo("Auto-join is globally disabled.");
        return false;
    }

    if (!snipe.trigger.state.autojoin) {
        snipe.logInfo("Auto-join is disabled for this trigger.");
        return false;
    }

    if (isRedundantJoin(snipe)) {
        snipe.markAsRedundantBiome();
        return false;
    }

    return true;
}

// --- Link verification ---

async function verifyLink(link: SnipableLink): Promise<VerifyLinkResult> {
    if (!settings.store.robloxToken) {
        showNotification({
            title: "⚠️ SoRa :: Link verification warning",
            body: "Link verification is enabled but robloxToken is missing.\nPlease configure a valid token or disable link verification to stop getting this notification.\nClick on this message to disable link verification.",
            onClick: () => settings.store.linkVerification = "disabled",
        });
        return { ok: false, reason: "no-token" };
    }

    const placeId = await getPlaceId(link);

    if (placeId === null) {
        await executeAction(settings.store.onBadLink);
        return { ok: false, reason: "resolve-failed", detail: link.code };
    }

    const allowedPlaceIds = parseCsv(settings.store.allowedPlaceIds);
    if (allowedPlaceIds.size === 0 || allowedPlaceIds.has(String(placeId))) {
        return { ok: true, placeId: String(placeId) };
    }

    await executeAction(settings.store.onBadLink);
    return { ok: false, reason: "place-not-allowed", detail: String(placeId) };
}

async function verifySnipeSafety(snipe: Snipe): Promise<void> {
    if (snipe.trigger.conditions.bypassLinkVerification) {
        snipe.logInfo("Link verification bypassed by trigger.");
        return;
    }
    if (settings.store.linkVerification === "disabled") {
        snipe.logInfo("Link verification disabled, skipping.");
        return;
    }

    if (snipe.link.type === "joinguard" && settings.store.interpretJoinguardLinks) {
        snipe.logWarn("Joinguard links are unverifiable due to cf turnstile.");
        snipe.markAsLinkNotVerified();
        return;
    }

    snipe.logInfo("Verifying link...");
    const result = await verifyLink(snipe.link);

    if (result.ok) {
        snipe.markAsLinkSafe();
        snipe.logInfo(`Link verified: Place ID ${result.placeId} is allowed.`);
    } else if (result.reason === "no-token") {
        snipe.markAsLinkUnsafe();
        snipe.logError("Link verification failed: no Roblox token configured.");
    } else if (result.reason === "resolve-failed") {
        snipe.markAsLinkNotVerified();
        snipe.logWarn(`Link verification failed: could not resolve place ID for code "${result.detail}".`);
    } else {
        snipe.markAsLinkUnsafe();
        snipe.logWarn(`Link unsafe: Place ID ${result.detail} is not in the allowed list.`);
    }
}

// --- Macro kill signal ---

async function sendMacroKillSignal(snipe: Snipe): Promise<void> {
    if (!settings.store.sendKillProcessSignal) return;

    const { matchBy, values } = getEffectiveKillTargets();
    if (values.size === 0) {
        snipe.logWarn("Kill signal is enabled but no process names are configured.");
        return;
    }

    snipe.logInfo(`Kill signal sent (${matchBy === "title" ? "window title" : "process name"}): ${[...values].join(", ")}`);

    const results = await Promise.all(
        [...values].map(async value => ({
            value,
            ...(await Native.killProcess(matchBy === "title" ? { windowTitle: value } : { pname: value })),
        }))
    );

    for (const r of results) {
        if (r.ok) {
            logger.debug(`${r.value} killed successfully.`);
        } else {
            snipe.logWarn(`${r.value}: not found or failed to kill.`);
        }
    }
}

// --- Emulator close signal ---

async function sendAdbCloseSignal(snipe: Snipe): Promise<void> {
    if (!settings.store.ldpAdbPath?.trim()) {
        snipe.logWarn("LDPlayer adb path not configured!");
        return;
    }

    const delay = settings.store.adbCloseDelayMs ?? 0;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    // If the emulator is open but Roblox is not running, this does nothing
    const t = performance.now();
    const adbResult = await Native.closeRobloxOnEmulator(
        settings.store.ldpAdbPath,
        settings.store.ldpAdbDeviceSerial || "emulator-5554",
        settings.store.ldpAdbPackageName || "com.roblox.client"
    );
    logger.debug(`ADB close took ${(performance.now() - t).toFixed(0)}ms (after a ${delay}ms delay)`);
    if (!adbResult.ok) {
        snipe.logWarn(`ADB close failed: ${adbResult.error}`);
        if (!settings.store.omitAdbErrorNotifications) {
            showNotification({
                title: "⚠️ SoRa :: Plugin issues!",
                body: `Emulator failed to process close signal.\n> ${adbResult.error}`,
            });
        }
    }
}

// --- Timing helpers ---

const DISCORD_EPOCH = 1420070400000n;

/** When Discord's servers made this message (or its last edit), in epoch ms. */
function discordSentAt(message: Snipe["message"]): number | null {
    const edited = (message as any).edited_timestamp ?? (message as any).editedTimestamp;
    if (edited) {
        const t = Date.parse(String(edited));
        if (!Number.isNaN(t)) return t;
    }
    try {
        return Number((BigInt(message.id) >> 22n) + DISCORD_EPOCH);
    } catch {
        return null;
    }
}

/**
 * performance.now() value -> wall clock epoch ms, on the system clock that Roblox's logs and
 * Discord use. timeOrigin + t drifts from it over long uptimes, so measure back from Date.now().
 */
const toWall = (t: number) => Math.round(Date.now() - (performance.now() - t));

// --- Join execution ---

async function joinServer(uri: string, snipe: Snipe): Promise<JoinServerResult> {
    const tJoinStart = performance.now();

    const tKillStart = performance.now();
    let killDurationMs: number | null = null;
    try {
        if (settings.store.joinMode === "safe") {
            await closeGame();
        }
        killDurationMs = performance.now() - tKillStart;
    } catch (err) {
        return { ok: false, reason: "native-failed", detail: (err as Error).message };
    }

    const tOpenStart = performance.now();
    let launch: Awaited<ReturnType<typeof Native.openUri>>;
    try {
        launch = await Native.openUri(uri, settings.store.launchMethod === "shell" ? "shell" : "direct", settings.store.launchExePath || undefined);
    } catch (err) {
        return { ok: false, reason: "native-failed", detail: (err as Error).message };
    }
    const openUriDurationMs = performance.now() - tOpenStart;

    const tJoinEnd = performance.now();

    // Not awaited: it must not delay the join lock or biome detection below
    sendMacroKillSignal(snipe).catch(err =>
        logger.error("Kill signal crashed unexpectedly:", err)
    );

    // Not awaited either: adb only matters after Roblox has the link, and it used to hold up
    // notifications and the join lock for as long as adb took
    if (settings.store.sendAdbSignal) {
        sendAdbCloseSignal(snipe).catch(err =>
            logger.error("ADB close signal crashed unexpectedly:", err)
        );
    }

    if (launch?.exe) snipe.logDebug(`Direct launch ran ${redactUserPath(launch.exe)}`);
    if (launch?.fallbackReason && settings.store.launchMethod !== "shell") {
        snipe.logWarn(`Direct launch not used, fell back to the shell: ${launch.fallbackReason}`);
    }

    const receivedAt = toWall(snipe.tMessageReceived);
    const sentAt = discordSentAt(snipe.message);

    return {
        ok: true,
        metrics: {
            joinDurationMs: tJoinEnd - tJoinStart,
            timeToJoinMs: tJoinEnd - snipe.tMessageReceived,
            overheadMs: (tJoinEnd - snipe.tMessageReceived) - (tJoinEnd - tJoinStart),
            killDurationMs,
            openUriDurationMs,
            receivedAt,
            launchedAt: toWall(tOpenStart),
            discordDelayMs: sentAt === null ? null : receivedAt - sentAt,
            launchMethod: launch?.method,
            launchFallback: launch?.fallbackReason,
            launchExe: launch?.exe,
            joinMode: settings.store.joinMode === "safe" ? "safe" : "unsafe",
            discordFocused: document.hasFocus(),
        },
    };
}

export async function join(snipe: Snipe): Promise<void> {
    if (settings.store.linkVerification === "before") {
        await verifySnipeSafety(snipe);
        if (!snipe.isSafe()) {
            snipe.logWarn("Join aborted: link failed verification (before).");
            return;
        }
    }

    const uri = snipe.getJoinUri();
    if (!uri) {
        snipe.markAsFailed();
        snipe.logError("Join failed: no URI available.");
        return;
    }

    snipe.logInfo(`Attempting to join: ${uri}`);
    logger.info(`Joining: ${uri}`);
    const result = await joinServer(uri, snipe);
    if (!result.ok) {
        snipe.markAsFailed();
        snipe.logError(`Join failed: ${result.detail ?? result.reason}`);
        return;
    }

    snipe.setMetrics(result.metrics);
    scheduleTimelineCapture(snipe.id);
    const m = result.metrics;
    const discordPart = m.discordDelayMs != null ? `, Discord delivery: ${m.discordDelayMs}ms` : "";
    snipe.logInfo(`Joined in ${m.joinDurationMs.toFixed(1)}ms (overhead: ${m.overheadMs.toFixed(1)}ms, launch: ${m.openUriDurationMs.toFixed(1)}ms ${m.launchMethod ?? "?"}${discordPart})`);

    if (settings.store.linkVerification === "after") {
        await verifySnipeSafety(snipe);
        if (!snipe.isSafe()) {
            snipe.logWarn("Link failed verification (after join).");
            return;
        }
    }

    activateJoinLock(snipe);
    startBiomeDetection(snipe);
}
