/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "../logger";
import { settings } from "../settings";
import { Native } from "../utils";
import { stopAutoPlay } from "./EmulatorAutoPlay";
import { stopWindowsAutoPlay } from "./WindowsAutoPlay";

const logger = new Logger("SolRadar.InputAutomation");

/** Stops both the emulator taps and the Windows clicks. */
export function stopAllAutoPlay(reason: string): void {
    stopAutoPlay(reason);
    stopWindowsAutoPlay(reason);
}

/** Last resort: stops every click, any capture, the Windows input helper, the adb server and every adb.exe. */
export async function forceKillAutomation(): Promise<{ ok: boolean; error?: string; }> {
    stopAllAutoPlay("force killed");
    await Native.stopWinInput();
    const res = await Native.forceKillAdb(settings.store.ldpAdbPath);
    if (res.ok) logger.warn("Force killed all input automation");
    else logger.error(`Force kill failed: ${res.error}`);
    return res;
}
