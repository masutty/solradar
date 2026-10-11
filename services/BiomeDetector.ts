/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * This file contains logic derived from or inspired by the project cresqnt-sys/MultiScope.
 * Portions of the biome detection logic may include translations, adaptations,
 * reinterpretations, or reimplementations of the original Python implementation.
 *
 * Original commit hash: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79 (AGPL-3.0-or-later)
 * Source File referenced: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79/detection.py
 *
 * This derivative work is distributed under the terms of the
 * GNU Affero General Public License version 3 (AGPL-3.0).
 */

import { PluginNative } from "@utils/types";

import { Logger } from "../logger";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../native")>;
const logger = new Logger("SolRadar.BiomeDetector");

// --- Types ---

export interface BiomeSnapshot {
    username: string;
    biome: string | null;
    lastUpdatedAt: number;
}

export interface BiomeChangedEvent {
    username: string;
    from: string | null;
    to: string;
}

export interface BiomeClearedEvent {
    username: string;
    from: string;
}

type BiomeEventMap = {
    biomeChanged: BiomeChangedEvent;
    biomeCleared: BiomeClearedEvent;
};

type BiomeListener<K extends keyof BiomeEventMap> = (event: BiomeEventMap[K]) => void;

interface AccountState {
    userid: string;
    username: string;
    logPath: string | null;
    lastKnownBiome: string | undefined;
    lastSeenRpcTs: string | undefined;
    lastBiomeUpdatedAt: number;
}

const STALE_THRESHOLD_MS = 60_000;

function _parseBiomeFromRpc(rpcLine: string): string | null {
    try {
        const jsonStart = rpcLine.indexOf("{");
        if (jsonStart === -1) return null;
        const data = JSON.parse(rpcLine.substring(jsonStart));
        const hover = data?.data?.largeImage?.hoverText;
        return typeof hover === "string" ? hover : null;
    } catch {
        return null;
    }
}

// --- BiomeDetectorService ---

class BiomeDetectorService {
    private _running = false;
    private _loop?: ReturnType<typeof setInterval>;
    private _accounts: Map<string, AccountState> = new Map();
    private _listeners: { [K in keyof BiomeEventMap]?: Set<BiomeListener<K>>; } = {};

    // --- Lifecycle ---

    async configure(usernames: string[]): Promise<void> {
        if (!usernames.length) return;

        const mapping = await Native.robloxUsernamesToUserIds(usernames);

        this._accounts.clear();
        const failed: string[] = [];
        for (const [username, userid] of Object.entries(mapping)) {
            if (userid === null) {
                failed.push(username);
                continue;
            }
            this._accounts.set(String(userid), {
                userid: String(userid),
                username,
                logPath: null,
                lastKnownBiome: undefined,
                lastSeenRpcTs: undefined,
                lastBiomeUpdatedAt: 0,
            });
        }

        const ok = [...this._accounts.values()].map(s => s.username);
        logger.info(`Configured ${ok.length}/${usernames.length} account(s): ${ok.join(", ")}${failed.length ? ` | failed: ${failed.join(", ")}` : ""}`);
    }

    start(intervalMs = 1_000): void {
        if (this._running) return;
        this._running = true;
        this._tick();
        this._loop = setInterval(() => this._tick(), intervalMs);
        logger.info(`Detection loop started (interval: ${intervalMs}ms).`);
    }

    stop(): void {
        this._running = false;
        if (this._loop) clearInterval(this._loop);
        this._loop = undefined;
        this._listeners = {};
        logger.info("Detection loop stopped.");
    }

    // --- Events ---

    on<K extends keyof BiomeEventMap>(event: K, listener: BiomeListener<K>): () => void {
        if (!this._listeners[event]) {
            this._listeners[event] = new Set() as any;
        }
        (this._listeners[event] as Set<BiomeListener<K>>).add(listener);
        return () => this.off(event, listener);
    }

    off<K extends keyof BiomeEventMap>(event: K, listener: BiomeListener<K>): void {
        (this._listeners[event] as Set<BiomeListener<K>> | undefined)?.delete(listener);
    }

    private _emit<K extends keyof BiomeEventMap>(event: K, payload: BiomeEventMap[K]): void {
        (this._listeners[event] as Set<BiomeListener<K>> | undefined)?.forEach(fn => {
            try { fn(payload); } catch (e) { logger.error(`Listener error on "${event}":`, e); }
        });
    }

    // --- Queries ---

    getBiome(username: string): BiomeSnapshot | null {
        const state = this._findByUsername(username);
        if (!state) return null;

        const isStale = state.lastBiomeUpdatedAt > 0
            && (Date.now() - state.lastBiomeUpdatedAt) > STALE_THRESHOLD_MS;

        return {
            username,
            biome: (state.lastKnownBiome && !isStale) ? state.lastKnownBiome : null,
            lastUpdatedAt: state.lastBiomeUpdatedAt,
        };
    }

    isAnyAccountInBiome(biomeName: string): boolean {
        const target = biomeName.toLowerCase();
        for (const state of this._accounts.values()) {
            const snap = this.getBiome(state.username);
            if (snap?.biome?.toLowerCase() === target) return true;
        }
        return false;
    }

    // --- Internal tick ---

    private async _tick(): Promise<void> {
        if (!this._running || !this._accounts.size) return;
        try {
            await this._syncLogPaths();
            await this._checkAllBiomes();
        } catch (err) {
            logger.error("Tick error:", err);
        }
    }

    private async _syncLogPaths(): Promise<void> {
        const logs = await Native.getRobloxLogs("userid");
        if (!logs.length) return;

        const newest: Record<string, { path: string; mtime: number; }> = {};
        for (const entry of logs) {
            if (!entry.account) continue;
            const cur = newest[entry.account];
            if (!cur || entry.lastModified > cur.mtime) {
                newest[entry.account] = { path: entry.path, mtime: entry.lastModified };
            }
        }

        for (const [userid, state] of this._accounts) {
            const found = newest[userid];
            if (found && found.path !== state.logPath) {
                logger.debug(`Log path for ${state.username}: ${found.path.split(/[\\/]/).pop()}`);
                state.logPath = found.path;
                state.lastKnownBiome = undefined;
                state.lastSeenRpcTs = undefined;
                state.lastBiomeUpdatedAt = 0;
            }
        }
    }

    private async _checkAllBiomes(): Promise<void> {
        for (const state of this._accounts.values()) {
            await this._checkSingleAccount(state);
        }
    }

    private async _checkSingleAccount(state: AccountState): Promise<void> {
        if (!state.logPath) return;

        const { rpcs, effectiveDisconnected } =
            await Native.getRelevantRpcsFromLogTail(state.logPath);

        if (effectiveDisconnected) {
            if (state.lastKnownBiome !== undefined) {
                const from = state.lastKnownBiome;
                logger.info(`${state.username} disconnected, clearing biome.`);
                state.lastKnownBiome = undefined;
                state.lastBiomeUpdatedAt = Date.now();
                this._emit("biomeCleared", { username: state.username, from });
            }
            return;
        }

        if (!rpcs.length) return;

        const mostRecentRpc = rpcs[rpcs.length - 1];
        const ts = mostRecentRpc.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/)?.[1];
        if (!ts || state.lastSeenRpcTs === ts) return;
        state.lastSeenRpcTs = ts;

        const biome = _parseBiomeFromRpc(mostRecentRpc);
        if (!biome) return;

        if (state.lastKnownBiome !== biome) {
            const from = state.lastKnownBiome ?? null;
            logger.info(`${state.username}: biome "${from ?? "none"}" → "${biome}"`);
            state.lastKnownBiome = biome;
            state.lastBiomeUpdatedAt = Date.now();
            this._emit("biomeChanged", { username: state.username, from, to: biome });
        } else {
            state.lastKnownBiome = biome;
            state.lastBiomeUpdatedAt = Date.now();
        }
    }

    // --- Helpers ---

    private _findByUsername(username: string): AccountState | undefined {
        for (const state of this._accounts.values()) {
            if (state.username === username) return state;
        }
        return undefined;
    }
}

export const BiomeDetector = new BiomeDetectorService();
