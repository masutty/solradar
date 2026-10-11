/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { React } from "@webpack/common";

// --- Constants ---

const STORAGE_KEY = "solsRadar_snipeHistory";
const LEGACY_LS_KEY = "solsRadar_snipeHistory";
const MAX_ENTRIES = 100; // about 5 KB each

// --- Tags ---

export type SnipeTag =
    | "biome-verified-real"
    | "biome-verified-bait"
    | "biome-verified-timeout"
    | "biome-not-verified"
    | "link-verified-safe"
    | "link-verified-unsafe"
    | "link-not-verified"
    | "link-ignored"
    | "redundant-biome-ignored"
    | "redundant-biome-bypassed"
    | "failed"
    | "unknown";

export interface SnipeTagConfig {
    label: string;
    emoji?: string;
    detail?: string;
    priority: number;
}

export const TAG_CONFIGS: Record<SnipeTag, SnipeTagConfig> = {
    "biome-verified-real": { emoji: "✅", label: "Biome", detail: "Biome was verified", priority: 70 },
    "biome-verified-bait": { emoji: "❌", label: "Biome", detail: "Biome was verified", priority: 70 },
    "biome-verified-timeout": { emoji: "⏳", label: "Biome", detail: "Biome check timed out", priority: 50 },
    "biome-not-verified": { emoji: "⚠️", label: "Biome", detail: "Biome was not verified", priority: 20 },
    "link-verified-safe": { emoji: "✅", label: "Link", detail: "Link was verified, is allowed", priority: 60 },
    "link-verified-unsafe": { emoji: "❌", label: "Link", detail: "Link was verified, is not allowed", priority: 65 },
    "link-not-verified": { emoji: "⚠️", label: "Link", detail: "Link was not verified", priority: 20 },
    "link-ignored": { emoji: "❌", label: "Ignored", detail: "This snipe was ignored. Check logs for details.", priority: 0 },
    "redundant-biome-ignored": { emoji: "❌", label: "Ignored", detail: "This snipe was ignored due to biome redundancy", priority: 0 },
    "redundant-biome-bypassed": { emoji: "➡️", label: "Bypassed", detail: "This biome was redundant, but a fresh-bypass keyword was detected.", priority: 0 },
    "failed": { emoji: "❌", label: "Join", detail: "Something went wrong trying to join this.", priority: 80 },
    "unknown": { emoji: "❔", label: "Unknown", detail: "Placeholder tag. This should not appear.", priority: 10 },
};

// --- Types ---

export interface SnipeMetrics {
    timeToJoinMs: number;
    joinDurationMs: number;
    overheadMs: number;
    killDurationMs: number | null;
    openUriDurationMs: number;
}

export interface SnipeLogEntry {
    timestamp: number;
    level: "info" | "warn" | "error" | "debug";
    message: string;
}

export interface SnipeEntry {
    id: number;
    timestamp: number;

    triggerName: string;
    triggerType: string;
    triggerPriority: number;

    iconUrl?: string;

    authorName?: string;
    authorAvatarUrl?: string;
    authorId?: string;
    channelName?: string;
    guildName?: string;
    /** Missing on older snipes, which group by guildName instead. */
    guildId?: string;
    messageJumpUrl?: string;
    processedMessageText?: string;

    tags: SnipeTag[];

    metrics?: SnipeMetrics;

    joinUri?: string;
    link?: string;

    log: SnipeLogEntry[];

    biomeDurationMs?: number;
}

export type NewSnipeData = Omit<SnipeEntry, "id" | "timestamp" | "tags" | "log"> & {
    tags?: SnipeTag[];
    log?: SnipeLogEntry[];
};

type Listener = (entries: SnipeEntry[]) => void;

// --- Store ---

class SnipeHistoryStore {
    private _entries: SnipeEntry[] = [];
    private _listeners = new Set<Listener>();

    /** Resolves once entries are loaded. Await it before using the store outside React hooks. */
    readonly ready: Promise<void>;

    constructor() {
        this.ready = this._init();
    }

    // --- Init ---

    private async _init(): Promise<void> {
        await this._load();
        await this._migrateLegacy();
    }

    /** One-time move of old localStorage history into IDB. */
    private async _migrateLegacy(): Promise<void> {
        if (this._entries.length > 0) return;

        try {
            const raw = globalThis.localStorage?.getItem(LEGACY_LS_KEY);
            if (!raw) return;

            const parsed: SnipeEntry[] = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) return;

            this._entries = parsed.slice(0, MAX_ENTRIES);
            await this._persist();

            globalThis.localStorage.removeItem(LEGACY_LS_KEY);
            console.info("[SnipeStore] Migrated", this._entries.length, "entries from localStorage → IDB");
        } catch (e) {
            console.error("[SnipeStore] Legacy migration failed:", e);
        }
    }

    // --- Reading ---

    get all(): SnipeEntry[] {
        return [...this._entries];
    }

    get count(): number {
        return this._entries.length;
    }

    getById(id: number): SnipeEntry | undefined {
        return this._entries.find(e => e.id === id);
    }

    getRecent(limit = 10): SnipeEntry[] {
        return this._entries.slice(0, limit);
    }

    getPrimaryTag(entry: SnipeEntry): SnipeTag {
        if (!entry.tags.length) return "unknown";
        return entry.tags.reduce((best, tag) =>
            (TAG_CONFIGS[tag]?.priority ?? 0) > (TAG_CONFIGS[best]?.priority ?? 0) ? tag : best
        );
    }

    // --- Mutations ---

    add(data: NewSnipeData): number {
        const entry: SnipeEntry = {
            ...data,
            id: Date.now(),
            timestamp: Date.now(),
            tags: data.tags ?? [],
            log: [],
        };

        this._entries.unshift(entry);
        if (this._entries.length > MAX_ENTRIES) {
            this._entries.length = MAX_ENTRIES;
        }

        void this._commit();
        return entry.id;
    }

    update(
        id: number,
        patch: Partial<Omit<SnipeEntry, "id" | "timestamp">>,
        opts: { replaceTags?: boolean; } = {}
    ): boolean {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx === -1) return false;

        const current = this._entries[idx];
        const tags = patch.tags
            ? opts.replaceTags
                ? patch.tags
                : [...new Set([...current.tags, ...patch.tags])]
            : current.tags;

        this._entries[idx] = { ...current, ...patch, tags };
        void this._commit();
        return true;
    }

    addTags(id: number, ...tags: SnipeTag[]): boolean {
        const entry = this.getById(id);
        if (!entry) return false;

        const base = tags.some(t => t !== "unknown")
            ? entry.tags.filter(t => t !== "unknown")
            : entry.tags;

        return this.update(id, { tags: [...new Set([...base, ...tags])] }, { replaceTags: true });
    }

    delete(id: number): boolean {
        const before = this._entries.length;
        this._entries = this._entries.filter(e => e.id !== id);
        if (this._entries.length === before) return false;
        void this._commit();
        return true;
    }

    clear(): void {
        this._entries = [];
        void this._commit();
    }

    addFakes(count: number): void {
        const choices: SnipeTag[][] = [
            ["link-not-verified", "biome-not-verified"],
            ["link-not-verified", "biome-verified-bait"],
            ["link-not-verified", "biome-verified-real"],
            ["link-not-verified", "biome-verified-timeout"],
            ["link-verified-safe", "biome-verified-real"],
            ["link-verified-unsafe"],
            ["unknown"],
            ["failed"],
            [],
        ];

        for (let i = 0; i < count; i++) {
            this.add({
                triggerName: "Fake Snipe",
                triggerType: "fake",
                triggerPriority: 0,
                tags: choices[Math.floor(Math.random() * choices.length)],
                metrics: { timeToJoinMs: 0, joinDurationMs: 0, overheadMs: 0, killDurationMs: 0, openUriDurationMs: 0 },
                processedMessageText: "Fake message",
                log: [],
            });
        }
    }

    appendLog(id: number, level: SnipeLogEntry["level"], message: string): boolean {
        const entry = this.getById(id);
        if (!entry) return false;
        return this.update(id, {
            log: [...entry.log, { timestamp: Date.now(), level, message }],
        }, { replaceTags: false });
    }

    // --- Observers ---

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _notify(): void {
        const snapshot = this.all;
        this._listeners.forEach(fn => {
            try { fn(snapshot); } catch (e) { console.error("[SnipeStore] Listener error:", e); }
        });
    }

    // --- Persistence ---

    private _commit(): Promise<void> {
        this._notify();
        return this._persist();
    }

    private async _persist(): Promise<void> {
        try {
            await DataStore.set(STORAGE_KEY, this._entries);
        } catch (e) {
            console.error("[SnipeStore] Failed to persist:", e);
        }
    }

    private async _load(): Promise<void> {
        try {
            const stored = await DataStore.get<SnipeEntry[]>(STORAGE_KEY);
            this._entries = Array.isArray(stored) ? stored : [];
        } catch (e) {
            console.error("[SnipeStore] Failed to load history:", e);
            this._entries = [];
        }
    }
}

export const SnipeStore = new SnipeHistoryStore();

// --- Hook ---

export function useSnipeHistory(): SnipeEntry[] {
    const [entries, setEntries] = React.useState<SnipeEntry[]>(SnipeStore.all);

    React.useEffect(() => {
        // Entries may finish loading after the first render
        SnipeStore.ready.then(() => setEntries(SnipeStore.all));
        return SnipeStore.subscribe(setEntries);
    }, []);

    return entries;
}

export function useSnipeEntry(id: number): SnipeEntry | undefined {
    const [entry, setEntry] = React.useState(() => SnipeStore.getById(id));

    React.useEffect(() => {
        SnipeStore.ready.then(() => setEntry(SnipeStore.getById(id)));
        return SnipeStore.subscribe(entries => setEntry(entries.find(e => e.id === id)));
    }, [id]);

    return entry;
}
