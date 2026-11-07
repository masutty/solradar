/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

import { Logger } from "../logger";
import { settings } from "../settings";
import { createAutoPlayStore } from "./AutoPlayState";

const logger = new Logger("SolRadar.AutoPlay");

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../native")>;

export const emulatorAutoPlay = createAutoPlayStore();

/** Stops the Play tapping on the emulator, if it is running. */
export function stopAutoPlay(reason: string): void {
    const { taps } = emulatorAutoPlay.get();
    if (emulatorAutoPlay.end(reason)) logger.info(`Stopped after ${taps} taps: ${reason}`);
}

/** Taps the Play button on the emulator for a while, until stopped or the duration ends. */
export async function startAutoPlay(): Promise<void> {
    if (!settings.store.inputAutomationEnabled || !settings.store.adbAutoPlay) return;

    const { ldpAdbPath, ldpAdbDeviceSerial, adbPlayX, adbPlayY, adbPlayDelayMs, adbPlayIntervalMs, adbPlayDurationMs } = settings.store;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    const mine = emulatorAutoPlay.begin(`Waiting ${adbPlayDelayMs}ms for the game to load`);
    logger.info(`Waiting ${adbPlayDelayMs}ms, then tapping (${adbPlayX}, ${adbPlayY}) every ${adbPlayIntervalMs}ms for up to ${adbPlayDurationMs}ms`);

    await sleep(adbPlayDelayMs);
    if (!emulatorAutoPlay.isCurrent(mine)) return;

    const end = Date.now() + adbPlayDurationMs;
    emulatorAutoPlay.update({ status: "tapping", note: `Tapping (${adbPlayX}, ${adbPlayY})` });

    while (Date.now() < end) {
        const res = await Native.emulatorTap(ldpAdbPath, ldpAdbDeviceSerial, adbPlayX, adbPlayY);
        if (!emulatorAutoPlay.isCurrent(mine)) return;

        if (!res.ok) {
            logger.warn(`Play tap failed: ${res.error}`);
            stopAutoPlay(`tap failed: ${res.error}`);
            return;
        }

        const taps = emulatorAutoPlay.get().taps + 1;
        emulatorAutoPlay.update({ taps, lastTapAt: Date.now() });
        logger.debug(`Play tap ${taps} sent`);
        await sleep(adbPlayIntervalMs);
        if (!emulatorAutoPlay.isCurrent(mine)) return;
    }

    stopAutoPlay("duration reached");
}
