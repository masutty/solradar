/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Join speed: reads what Roblox logged after a launch and turns snipes into stats.
// Experimental, used by the join-speed tests (JoinModal and the Developer tab).

import { Logger } from "../logger";
import { RobloxTimelineData, SnipeEntry, SnipeStore } from "../stores/SnipeStore";
import { Native } from "../utils";

const logger = new Logger("SolRadar.JoinTimeline");

/** How long after a launch to read Roblox's log. Long enough for a normal join to finish. */
export const CAPTURE_DELAY_MS = 30_000;

export const isTimelineComplete = (t: RobloxTimelineData | undefined) =>
    !!t && t.stages.connected !== undefined;

/**
 * Reads Roblox's log for this snipe's launch and saves the result on the entry.
 * Skips entries that already have a complete timeline, unless forced.
 */
export async function captureRobloxTimeline(id: number, force = false): Promise<RobloxTimelineData | null> {
    const entry = SnipeStore.getById(id);
    const launchedAt = entry?.metrics?.launchedAt;
    if (!entry || !launchedAt) return null;
    if (!force && isTimelineComplete(entry.robloxTimeline)) return entry.robloxTimeline!;

    const res = await Native.getRobloxJoinTimeline(launchedAt);
    if (!res.ok) {
        logger.debug(`No Roblox timeline for snipe ${id}: ${res.error}`);
        return entry.robloxTimeline ?? null;
    }
    const data: RobloxTimelineData = { mode: res.mode, forwarderMs: res.forwarderMs, stages: res.stages, slowHttp: res.slowHttp };
    SnipeStore.update(id, { robloxTimeline: data });
    return data;
}

export function scheduleTimelineCapture(id: number): void {
    setTimeout(() => {
        captureRobloxTimeline(id).catch(err => logger.error("Timeline capture failed:", err));
    }, CAPTURE_DELAY_MS);
}

// --- Phases ---

export type PhaseKey =
    | "discord" | "plugin" | "launch"
    | "handoff" | "resolve" | "prepare" | "gamejoin" | "connect"
    | "toServer" | "total";

export const PHASES: { key: PhaseKey; label: string; tip: string; }[] = [
    { key: "discord", label: "Discord delivery", tip: "Message created on Discord's servers until it reached the plugin. Includes your clock's drift, so compare it with itself, not as an exact number." },
    { key: "plugin", label: "Plugin", tip: "Reading the message, finding the trigger, checking for duplicates." },
    { key: "launch", label: "Launch call", tip: "Handing the link to Windows. Direct starts Roblox's exe; Shell goes through cmd.exe first." },
    { key: "handoff", label: "Hand-off", tip: "From the launch call until the open Roblox got the link. Mostly a second Roblox process starting up just to pass the link along (home page mode). For a cold start, until the new Roblox wrote its first log line." },
    { key: "resolve", label: "Link resolve", tip: "Roblox asking its API what the link points to. Network bound." },
    { key: "prepare", label: "Prepare", tip: "Roblox setting up the game on your PC. CPU bound." },
    { key: "gamejoin", label: "Server request", tip: "Roblox asking for a spot in the server. Ends when it has one: this is the moment that wins or loses a full server. Network bound." },
    { key: "connect", label: "Connect", tip: "Connecting to the game server itself." },
    { key: "toServer", label: "Message → server", tip: "From the message reaching the plugin until Roblox got a spot in the server." },
    { key: "total", label: "Message → connected", tip: "From the message reaching the plugin until connected to the game server." },
];

/** Every phase this entry has data for, in ms. */
export function phasesOf(entry: SnipeEntry): Partial<Record<PhaseKey, number>> {
    const m = entry.metrics;
    if (!m) return {};
    const out: Partial<Record<PhaseKey, number>> = {};
    if (m.discordDelayMs != null) out.discord = m.discordDelayMs;
    out.plugin = m.overheadMs;
    out.launch = m.openUriDurationMs;

    const t = entry.robloxTimeline;
    if (!t || !m.launchedAt) return out;
    const s = t.stages;
    const gotLink = s.deeplink ?? s.processStart;
    const diff = (a?: number, b?: number) => a !== undefined && b !== undefined && b >= a ? b - a : undefined;

    const set = (k: PhaseKey, v: number | undefined) => { if (v !== undefined) out[k] = v; };
    set("handoff", diff(m.launchedAt, gotLink));
    set("resolve", diff(gotLink, s.linkResolved));
    set("prepare", diff(s.linkResolved, s.dmReady));
    set("gamejoin", diff(s.dmReady ?? s.linkResolved, s.serverAssigned));
    set("connect", diff(s.serverAssigned, s.connected));
    if (m.receivedAt) {
        set("toServer", diff(m.receivedAt, s.serverAssigned));
        set("total", diff(m.receivedAt, s.connected));
    }
    return out;
}

// --- Stats ---

export type Summary = { n: number; mean: number; p50: number; p90: number; min: number; max: number; };

export function summarize(values: number[]): Summary | null {
    const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!xs.length) return null;
    const q = (p: number) => xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))];
    return {
        n: xs.length,
        mean: xs.reduce((a, b) => a + b, 0) / xs.length,
        p50: q(0.5),
        p90: q(0.9),
        min: xs[0],
        max: xs[xs.length - 1],
    };
}

/** Entries that actually launched Roblox (have reaction metrics). */
export const joinedEntries = (entries: SnipeEntry[]) =>
    entries.filter(e => e.metrics && e.metrics.timeToJoinMs > 0 && e.triggerType !== "fake");
