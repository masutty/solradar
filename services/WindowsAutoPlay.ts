/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "../logger";
import { settings } from "../settings";
import { Native } from "../utils";
import { createAutoPlayStore } from "./AutoPlayState";
import { redactUserPaths } from "./paths";

const logger = new Logger("SolRadar.WinAutoPlay");

export const windowsAutoPlay = createAutoPlayStore();

/** Max time to wait for Roblox's log to show the connection before giving up. */
const CONNECT_TIMEOUT_MS = 60_000;
const CONNECT_POLL_MS = 2_000;
/** Clicks that never reached a focused Roblox window in a row before it gives up. */
const MAX_UNFOCUSED = 3;

const USER_MOVED = "you moved the mouse, so you are at the PC";

type Say ={ logInfo(m: string): void; logWarn(m: string): void; };

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function stopWindowsAutoPlay(reason: string): void {
    const { taps } = windowsAutoPlay.get();
    if (windowsAutoPlay.end(reason)) logger.info(`Stopped after ${taps} clicks: ${reason}`);
}

/** The part of a join link that tells servers apart: a share code, a private server link code, or the place. */
function linkToken(uri: string): string | null {
    return uri.match(/[?&](?:linkCode|code)=([^&]+)/)?.[1] ?? uri.match(/placeId=(\d+)/)?.[1] ?? null;
}

function safeDecode(s: string): string {
    try { return decodeURIComponent(s); } catch { return s; }
}

/** Waits until Roblox's own log says this launch connected to a server. */
async function waitForConnected(launchedAt: number, isCurrent: () => boolean): Promise<boolean> {
    const deadline = Date.now() + CONNECT_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (!isCurrent()) return false;
        const res = await Native.getRobloxJoinTimeline(launchedAt, 30_000);
        if (res.ok && res.stages.connected !== undefined) return true;
        await sleep(CONNECT_POLL_MS);
    }
    return false;
}

/**
 * Finds the Roblox process that has a window, newest first. A process whose command line carries
 * the link is preferred. That only happens in a fresh launch: a Roblox that was already open
 * hands the link to a short-lived helper and keeps its own command line.
 */
async function findRobloxWindow(uri: string, say: Say): Promise<number | null> {
    const found = await Native.findRobloxProcesses();
    if (!found.ok) {
        say.logWarn(`Could not list Roblox processes: ${found.error}`);
        return null;
    }

    const token = linkToken(uri);
    const matches = (commandLine: string) => !!token && (commandLine.includes(token) || safeDecode(commandLine).includes(token));
    const candidates = [...found.processes].sort((a, b) => Number(matches(b.commandLine)) - Number(matches(a.commandLine)) || b.startedAt - a.startedAt);

    for (const proc of candidates) {
        const info = await Native.winInput({ op: "info", pid: proc.pid });
        if (!info.ok || !info.found) continue;

        say.logInfo(matches(proc.commandLine)
            ? `Roblox ${proc.pid} was started with this link.`
            : `Roblox ${proc.pid} was already open (command line: ${redactUserPaths(proc.commandLine).slice(0, 120)}), so the connected line in its log is the proof.`);
        return proc.pid;
    }

    say.logWarn("No Roblox window found.");
    return null;
}

/**
 * After a snipe launches Roblox on this PC: waits for the log to show a connection, maximizes the window,
 * then clicks the Play button for a while. Stopped by a new snipe, Stop or Force kill.
 */
export async function startWindowsAutoPlay({ launchedAt, uri, say }: { launchedAt: number; uri: string; say: Say; }): Promise<void> {
    const s = settings.store;
    if (!s.inputAutomationEnabled || !s.winAutoPlay) return;

    if (!s.winPlayX && !s.winPlayY) {
        say.logWarn("Windows auto play is on, but the Play button position is not set.");
        return;
    }

    const mine = windowsAutoPlay.begin("Waiting for Roblox to connect");
    const current = () => windowsAutoPlay.isCurrent(mine);
    const fail = (reason: string) => {
        say.logWarn(`Windows auto play stopped: ${reason}`);
        stopWindowsAutoPlay(reason);
    };

    if (!await waitForConnected(launchedAt, current)) {
        if (current()) fail("Roblox never connected");
        return;
    }
    say.logInfo("Roblox connected, preparing the Play click.");

    windowsAutoPlay.update({ note: "Looking for the Roblox window" });
    const pid = await findRobloxWindow(uri, say);
    if (!current()) return;
    if (pid === null) return fail("no Roblox window");

    // From here on, a cursor that is not where we left it means the user is at the PC
    await Native.winInput({ op: "reset" });
    await Native.winInput({ op: "info", pid });
    if (!current()) return;

    if (s.winMaximize) {
        windowsAutoPlay.update({ note: "Maximizing the Roblox window" });
        const res = await Native.winInput({ op: "maximize", pid });
        if (!current()) return;
        if (res.userMoved) return fail(USER_MOVED);
        if (!res.ok) say.logWarn(`Maximize failed: ${res.error}`);
        else if (!res.maximized) say.logWarn("Roblox is still not maximized. Clicking anyway, the position may be off.");
        else say.logInfo(res.changed ? "Maximized the Roblox window." : "Roblox was already maximized.");
    }

    windowsAutoPlay.update({ note: `Waiting ${s.winPlayDelayMs}ms for the title screen` });
    await sleep(s.winPlayDelayMs);
    if (!current()) return;

    const end = Date.now() + s.winPlayDurationMs;
    let unfocused = 0;
    windowsAutoPlay.update({ status: "tapping", note: `Clicking (${s.winPlayX}%, ${s.winPlayY}%)` });

    while (Date.now() < end) {
        const res = await Native.winInput({ op: "click", pid, fx: s.winPlayX, fy: s.winPlayY });
        if (!current()) return;
        if (res.userMoved) return fail(USER_MOVED);
        if (!res.ok) return fail(`click failed: ${res.error}`);

        if (res.clicked) {
            unfocused = 0;
            const taps = windowsAutoPlay.get().taps + 1;
            windowsAutoPlay.update({ taps, lastTapAt: Date.now() });
            logger.debug(`Play click ${taps} sent at ${res.x}, ${res.y}`);
        } else if (++unfocused >= MAX_UNFOCUSED) {
            return fail("Roblox would not come to the front (is the PC locked?), so nothing was clicked");
        } else {
            say.logWarn("Roblox did not come to the front, skipped a click.");
        }

        await sleep(s.winPlayIntervalMs);
        if (!current()) return;
    }

    say.logInfo(`Windows auto play done after ${windowsAutoPlay.get().taps} clicks.`);
    stopWindowsAutoPlay("duration reached");
}
