/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { Snipe } from "../models/Snipe";
import { settings } from "../settings";
import { JoinLockStore } from "../stores/JoinLockStore";
import { SnipeStore } from "../stores/SnipeStore";
import { TriggerType } from "../stores/TriggerStore";
import { formatElapsedTime } from "../utils";
import { scheduleCancelableAction } from "./ActionExecutor";
import { BiomeDetector } from "./BiomeDetector";
import { forwardSnipe } from "./ForwardingService";

const BIOME_DETECTABLE_TYPES = new Set<TriggerType>(["RARE_BIOME", "EVENT_BIOME", "BIOME", "WEATHER"]);

let _unsubscribeBiomeDetection: (() => void) | null = null;

export function cancelBiomeDetection(): void {
    _unsubscribeBiomeDetection?.();
    _unsubscribeBiomeDetection = null;
}

function _watchForBiomeEnd(snipe: Snipe): void {
    const biomeStartedAt = performance.now();
    const activeBiome = (snipe.trigger.biome?.detectionKeyword || snipe.trigger.name).toUpperCase();
    snipe.logInfo(`Watching for biome "${activeBiome}" to end.`);

    const finish = (reason: string, to?: string) => {
        const duration = Math.round(performance.now() - biomeStartedAt);
        const formattedDuration = formatElapsedTime(duration);
        snipe.setBiomeDuration(duration);
        snipe.logInfo(`Biome ended (${reason}) - duration: ${formattedDuration}${to ? ` (now "${to?.toUpperCase()}")` : ""}.`);
        JoinLockStore.release();
        unsubChange();
        unsubClear();
        scheduleCancelableAction({
            action: settings.store.onBiomeEnd,
            timeoutMs: settings.store.biomeEndActionTimeout ?? 10_000,
            title: `${snipe.trigger.name} biome ended`,
            iconUrl: snipe.trigger.iconUrl,
        });
    };

    const unsubChange = BiomeDetector.on("biomeChanged", ({ from, to }) => {
        if (from?.toUpperCase() !== activeBiome) {
            snipe.logDebug(`Biome changed "${from?.toUpperCase()}" → "${to?.toUpperCase()}" - not "${activeBiome}", skipping.`);
            return;
        }
        finish("biome changed", to);
    });

    const unsubClear = BiomeDetector.on("biomeCleared", ({ from }) => {
        if (from.toUpperCase() !== activeBiome) return;
        finish("disconnected");
    });
}

export function startBiomeDetection(snipe: Snipe): void {
    _unsubscribeBiomeDetection?.();

    if (!BIOME_DETECTABLE_TYPES.has(snipe.trigger.type)) {
        return;
    }
    if (!snipe.trigger.biome?.detectionEnabled) {
        snipe.markAsBiomeNotVerified();
        snipe.logInfo("Biome detection disabled for this trigger.");
        return;
    }
    if (!settings.store.detectorEnabled) {
        snipe.markAsBiomeNotVerified();
        snipe.logWarn("Biome detector is globally disabled.");
        return;
    }

    const expected = (snipe.trigger.biome.detectionKeyword || snipe.trigger.name).toUpperCase();
    const startDelayMs = settings.store.joinMode === "safe" ? 6_000 : 0;
    const t0 = performance.now();

    snipe.logInfo(`Awaiting biome - expecting "${expected}"${startDelayMs > 0 ? ` (delay: ${startDelayMs}ms)` : ""}.`);

    let detecting = true;

    const unsubChange = BiomeDetector.on("biomeChanged", ({ to }) => {
        if (!detecting) return;
        if (startDelayMs > 0 && performance.now() - t0 < startDelayMs) return;

        const elapsed = Math.round(performance.now() - t0);
        const detected = to.toUpperCase();
        detecting = false;
        _unsubscribeBiomeDetection = null;

        if (detected === expected) {
            snipe.markAsBiomeReal();
            snipe.logInfo(`Biome confirmed - "${detected}" matched in ${elapsed}ms.`);
            _watchForBiomeEnd(snipe);
            const joinMs = SnipeStore.getById(snipe.id)?.metrics?.timeToJoinMs;
            showNotification({
                title: `✅ SoRa :: ${snipe.trigger.name}: biome confirmed`,
                body: [
                    joinMs != null && `Join took ${formatElapsedTime(joinMs)}`,
                    `Detection took ${formatElapsedTime(elapsed)}`,
                ].filter(Boolean).join(" · "),
                icon: snipe.trigger.iconUrl,
            });
            if (snipe.trigger.forwarding.onDetection.enabled) {
                snipe.logInfo("Forwarding on detection...");
                forwardSnipe(snipe, "detection").catch(err => {
                    snipe.logError(`Forward on detection failed: ${(err as Error).message}`);
                });
            }
        } else {
            snipe.markAsBiomeBait();
            snipe.logWarn(`Biome bait - got "${detected}" instead of "${expected}" (${elapsed}ms).`);
            unsubChange();
            if (JoinLockStore.isLocked) {
                snipe.logWarn("Releasing join lock due to fake biome");
                JoinLockStore.release();
            }

            if (settings.store.onBiomeFalse !== "nothing") {
                snipe.logWarn("Sending cancelable notification");
                scheduleCancelableAction({
                    action: settings.store.onBiomeFalse,
                    timeoutMs: settings.store.biomeFalseActionTimeout ?? 10_000,
                    title: `${snipe.trigger.name}: fake biome`,
                    description: `Got "${detected}" instead of "${expected}"`,
                    iconUrl: snipe.trigger.iconUrl,
                });
            } else {
                showNotification({
                    title: `❌ SoRa :: ${snipe.trigger.name}: fake biome`,
                    body: `Got "${detected}" instead of "${expected}" (${elapsed}ms)`,
                    icon: snipe.trigger.iconUrl,
                });
            }
        }
    });

    const timer = setTimeout(() => {
        if (!detecting) return;
        detecting = false;
        unsubChange();
        _unsubscribeBiomeDetection = null;
        snipe.markAsBiomeTimeout();
        snipe.logWarn(`Biome detection timed out after ${((settings.store.detectorTimeoutMs ?? 30_000) + startDelayMs) / 1000}s.`);
        if (JoinLockStore.isLocked) JoinLockStore.release();
        if (settings.store.onBiomeTimeout !== "nothing") {
            scheduleCancelableAction({
                action: settings.store.onBiomeTimeout,
                timeoutMs: settings.store.biomeTimeoutActionTimeout ?? 10_000,
                title: `${snipe.trigger.name} - detection timed out`,
                iconUrl: snipe.trigger.iconUrl,
            });
        } else {
            showNotification({
                title: `⌛ SoRa :: Timeout - ${snipe.trigger.name}`,
                body: "Biome detection timed out.",
                icon: snipe.trigger.iconUrl,
            });
        }
    }, (settings.store.detectorTimeoutMs ?? 30_000) + startDelayMs);

    _unsubscribeBiomeDetection = () => {
        snipe.logWarn("Biome detection cancelled... another snipe probably happened");
        detecting = false;
        clearTimeout(timer);
        unsubChange();
    };
}
