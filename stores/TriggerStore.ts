/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* eslint-disable @stylistic/no-multi-spaces */

import { DataStore } from "@api/index";
import { React } from "@webpack/common";

import { Logger } from "../logger";

const logger = new Logger("SolRadar");

// --- Types ---

export type TriggerType = "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";

export interface TriggerState {
    enabled: boolean;
    autojoin: boolean;
    notify: boolean;
    joinlock: boolean;
    joinlockDuration: number; // seconds
    /**
     * 1 is the highest. While a join lock is active, only triggers with a lower number than
     * the one that set it can still join. A lock from priority 3 lets 1 and 2 through.
     */
    priority: number;
    notificationSound?: string; // data URI
    notificationSoundVolume?: number; // 0-100, default 100
}

export interface KeywordSet {
    strict: boolean;
    value: string[];
}

export interface TriggerConditions {
    keywords: {
        match: KeywordSet;
        exclude: KeywordSet;
    };
    mentionRoles: { id: string; label: string; }[]; // for servers that only ping a role instead of naming the biome
    fromUser: string[]; // empty = ignore check
    inChannel: string[]; // empty = ignore check
    ignoredChannels: string[];
    ignoredGuilds: string[];
    // Each bypass skips one global check for this trigger
    bypassMatchAmbiguity: boolean; // several triggers matched
    bypassMonitoredOnly: boolean; // monitored servers/channels
    bypassIgnoredGuilds: boolean; // ignored servers
    bypassForwardIgnoredGuilds: boolean; // no-forward servers
    bypassIgnoredChannels: boolean; // ignored channels
    bypassLinkVerification: boolean; // allowed place IDs
    bypassLinkDeduplication: boolean; // repeated links
}

export interface TriggerBiome {
    detectionEnabled: boolean;
    detectionKeyword: string;
    skipRedundantJoin: boolean;
}

export interface TriggerForwarding {
    webhookUrl: string;
    webhookContent: string;
    webhookEmbedDescription: string;
    excludedGuilds: string[];
    excludedChannels: string[];
    onMatch: {
        enabled: boolean;
        early: boolean;
    };
    onDetection: {
        enabled: boolean;
    };
}

export interface Trigger {
    id: string;
    type: TriggerType;
    name: string;
    description: string;
    iconUrl: string;
    state: TriggerState;
    conditions: TriggerConditions;
    forwarding: TriggerForwarding;
    biome?: TriggerBiome;
}

// --- Defaults ---

const DATASTORE_KEY = "SolsRadar_Triggers";

export const DEFAULT_TRIGGER_STATE: TriggerState = {
    enabled: true,
    autojoin: true,
    notify: true,
    joinlock: false,
    joinlockDuration: 0,
    priority: 10,
};

export const DEFAULT_CONDITIONS: TriggerConditions = {
    keywords: {
        match: { strict: false, value: [] },
        exclude: { strict: false, value: [] },
    },
    mentionRoles: [],
    fromUser: [],
    inChannel: [],
    ignoredChannels: [],
    ignoredGuilds: [],
    bypassMatchAmbiguity: false,
    bypassMonitoredOnly: false,
    bypassIgnoredGuilds: false,
    bypassForwardIgnoredGuilds: false,
    bypassIgnoredChannels: false,
    bypassLinkVerification: false,
    bypassLinkDeduplication: false,
};

export const DEFAULT_BIOME: TriggerBiome = {
    detectionEnabled: true,
    detectionKeyword: "",
    skipRedundantJoin: true,
};

export const DEFAULT_FORWARDING: TriggerForwarding = {
    webhookUrl: "",
    webhookContent: "",
    webhookEmbedDescription: "",
    excludedGuilds: [],
    excludedChannels: [],
    onMatch: {
        enabled: false,
        early: false,
    },
    onDetection: {
        enabled: false,
    },
};

export function makeDefaultTrigger(type: TriggerType = "BIOME"): Omit<Trigger, "id"> {
    const base: Omit<Trigger, "id"> = {
        type,
        name: "",
        description: "",
        iconUrl: "",
        state: { ...DEFAULT_TRIGGER_STATE },
        conditions: { ...DEFAULT_CONDITIONS },
        forwarding: { ...DEFAULT_FORWARDING },
    };

    if (type !== "MERCHANT") {
        base.biome = {
            ...DEFAULT_BIOME,
            detectionEnabled: type !== "CUSTOM",
        };
    }

    return base;
}

// --- Migration ---
// Runs on every stored trigger. Missing fields get defaults, existing data is kept.

function migrateTrigger(raw: any): Trigger {
    return {
        id: raw.id ?? crypto.randomUUID(),
        type: raw.type ?? "CUSTOM",
        name: raw.name ?? "",
        description: raw.description ?? "",
        iconUrl: raw.iconUrl ?? "",
        biome: {
            detectionEnabled: raw.biome?.detectionEnabled ?? DEFAULT_BIOME.detectionEnabled,
            detectionKeyword: raw.biome?.detectionKeyword ?? DEFAULT_BIOME.detectionKeyword,
            skipRedundantJoin: raw.biome?.skipRedundantJoin ?? DEFAULT_BIOME.skipRedundantJoin,
        },
        conditions: {
            keywords: {
                match: raw.conditions?.keywords?.match ?? { strict: false, value: [] },
                exclude: raw.conditions?.keywords?.exclude ?? { strict: false, value: [] },
            },
            mentionRoles: raw.conditions?.mentionRoles ?? [],
            fromUser: raw.conditions?.fromUser ?? [],
            inChannel: raw.conditions?.inChannel ?? [],
            ignoredChannels: raw.conditions?.ignoredChannels ?? [],
            ignoredGuilds: raw.conditions?.ignoredGuilds ?? [],
            bypassMatchAmbiguity: raw.conditions?.bypassMatchAmbiguity ?? false,
            bypassMonitoredOnly: raw.conditions?.bypassMonitoredOnly ?? false,
            bypassIgnoredGuilds: raw.conditions?.bypassIgnoredGuilds ?? false,
            bypassForwardIgnoredGuilds: raw.conditions?.bypassForwardIgnoredGuilds ?? false,
            bypassIgnoredChannels: raw.conditions?.bypassIgnoredChannels ?? false,
            bypassLinkVerification: raw.conditions?.bypassLinkVerification ?? false,
            bypassLinkDeduplication: raw.conditions?.bypassLinkDeduplication ?? false,
        },
        state: {
            enabled: raw.state?.enabled ?? DEFAULT_TRIGGER_STATE.enabled,
            autojoin: raw.state?.autojoin ?? DEFAULT_TRIGGER_STATE.autojoin,
            notify: raw.state?.notify ?? DEFAULT_TRIGGER_STATE.notify,
            joinlock: raw.state?.joinlock ?? DEFAULT_TRIGGER_STATE.joinlock,
            joinlockDuration: raw.state?.joinlockDuration ?? DEFAULT_TRIGGER_STATE.joinlockDuration,
            priority: raw.state?.priority ?? DEFAULT_TRIGGER_STATE.priority,
            notificationSound: raw.state?.notificationSound ?? "",
            notificationSoundVolume: raw.state?.notificationSoundVolume ?? 100,
        },
        forwarding: {
            webhookUrl: raw.forwarding?.webhookUrl ?? DEFAULT_FORWARDING.webhookUrl,
            webhookContent: raw.forwarding?.webhookContent ?? DEFAULT_FORWARDING.webhookContent,
            webhookEmbedDescription: raw.forwarding?.webhookEmbedDescription ?? DEFAULT_FORWARDING.webhookEmbedDescription,
            excludedGuilds: raw.forwarding?.excludedGuilds ?? DEFAULT_FORWARDING.excludedGuilds,
            excludedChannels: raw.forwarding?.excludedChannels ?? DEFAULT_FORWARDING.excludedChannels,
            onMatch: {
                enabled: raw.forwarding?.onMatch?.enabled ?? DEFAULT_FORWARDING.onMatch.enabled,
                early: raw.forwarding?.onMatch?.early ?? DEFAULT_FORWARDING.onMatch.early,
            },
            onDetection: {
                enabled: raw.forwarding?.onDetection?.enabled ?? DEFAULT_FORWARDING.onDetection.enabled,
            },
        },
    };
}

// --- Internal store ---

let _triggers: Trigger[] = [];
const _listeners = new Set<() => void>();

function notifyListeners(): void {
    _listeners.forEach(fn => fn());
}

// --- Init ---

let _resolveReady!: () => void;

/** Resolves once triggers are loaded. Await it before using triggers outside React hooks. */
export const triggerStoreReady: Promise<void> = new Promise(res => {
    _resolveReady = res;
});

// --- Queued persistence ---
// Writes run one at a time so they can't finish out of order.

let _writeQueue: Promise<void> = Promise.resolve();

function persist(): void {
    _writeQueue = _writeQueue.then(async () => {
        try {
            await DataStore.set(DATASTORE_KEY, _triggers);
        } catch (e) {
            logger.error("Failed to persist triggers:", e);
        }
    });
}

// --- Reading ---

export function getTriggers(): Trigger[] {
    return _triggers;
}

export function getTriggerById(id: string): Trigger | undefined {
    return _triggers.find(t => t.id === id);
}

export function getActiveTriggers(): Trigger[] {
    return _triggers.filter(t => t.state.enabled);
}

export function getTriggersWithOnMatchForwarding(): Trigger[] {
    return _triggers.filter(t => t.state.enabled && t.forwarding.onMatch.enabled);
}

export function getTriggersWithOnDetectionForwarding(): Trigger[] {
    return _triggers.filter(t => t.state.enabled && t.forwarding.onDetection.enabled);
}

// --- CRUD ---
// Every mutation waits for triggerStoreReady first.

export async function addTrigger(data: Omit<Trigger, "id">): Promise<Trigger> {
    await triggerStoreReady;
    const trigger: Trigger = { id: crypto.randomUUID(), ...data };
    _triggers = [..._triggers, trigger];
    notifyListeners();
    persist();
    return trigger;
}

export async function updateTrigger(id: string, patch: Partial<Omit<Trigger, "id">>): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.map(t => t.id === id ? { ...t, ...patch } : t);
    notifyListeners();
    persist();
}

export async function deleteTrigger(id: string): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.filter(t => t.id !== id);
    notifyListeners();
    persist();
}

export async function toggleTrigger(id: string): Promise<void> {
    await triggerStoreReady;
    _triggers = _triggers.map(t =>
        t.id === id ? { ...t, state: { ...t.state, enabled: !t.state.enabled } } : t
    );
    notifyListeners();
    persist();
}

export async function reorderTriggers(ordered: Trigger[]): Promise<void> {
    await triggerStoreReady;
    _triggers = ordered;
    notifyListeners();
    persist();
}

export async function duplicateTrigger(id: string): Promise<Trigger | undefined> {
    await triggerStoreReady;
    const idx = _triggers.findIndex(t => t.id === id);
    if (idx === -1) return undefined;

    const { id: _oldId, ...rest } = _triggers[idx];
    const copy: Trigger = {
        ...rest,
        id: crypto.randomUUID(),
        name: `${rest.name} (copy)`,
        state: { ...rest.state, enabled: false },
    };

    _triggers = [..._triggers.slice(0, idx + 1), copy, ..._triggers.slice(idx + 1)];
    notifyListeners();
    persist();
    return copy;
}

// --- Export / Import ---

export type RedactField =
    | "enabled"             // disables the trigger
    | "webhookUrl"          // clears forwarding.webhookUrl
    | "webhookForwarding"   // disables onMatch/onDetection
    | "webhookPersonal"     // clears webhook content, embed description, excluded guilds/channels
    | "notificationSound"   // removes the sound data URI
    | "customTriggers"      // drops CUSTOM triggers entirely
    | "conditions"          // clears personal IDs: fromUser, inChannel, ignored lists, mentionRoles
    | "bypasses";           // resets every bypass to false

export type ExportOptions = {
    redact?: RedactField[];
};

export function exportTriggersJson(): string {
    return JSON.stringify(_triggers, null, 2);
}

export function downloadTriggersJson(): void {
    _downloadJson(exportTriggersJson(), `solsradar-triggers-${Date.now()}.json`);
}

function _triggerSlug(trigger: Trigger): string {
    return trigger.name.trim().replace(/\s+/g, "-").toLowerCase() || "unnamed";
}

export function exportTriggerJson(trigger: Trigger): string {
    return JSON.stringify([trigger], null, 2);
}

export function downloadTriggerJson(trigger: Trigger): void {
    _downloadJson(exportTriggerJson(trigger), `solsradar-trigger-${_triggerSlug(trigger)}-${Date.now()}.json`);
}

function redactTrigger(trigger: Trigger, redact: Set<RedactField>): Trigger | null {
    if (redact.has("customTriggers") && trigger.type === "CUSTOM") return null;

    return {
        ...trigger,
        conditions: {
            ...trigger.conditions,
            ...(redact.has("conditions") && { fromUser: [], inChannel: [], ignoredChannels: [], ignoredGuilds: [], mentionRoles: [] }),
            ...(redact.has("bypasses") && {
                bypassMatchAmbiguity: false,
                bypassMonitoredOnly: false,
                bypassIgnoredGuilds: false,
                bypassForwardIgnoredGuilds: false,
                bypassIgnoredChannels: false,
                bypassLinkVerification: false,
                bypassLinkDeduplication: false,
            }),
        },
        state: {
            ...trigger.state,
            ...(redact.has("notificationSound") && { notificationSound: "", notificationSoundVolume: 100 }),
            ...(redact.has("enabled") && { enabled: false }),
        },
        forwarding: {
            ...trigger.forwarding,
            ...(redact.has("webhookUrl") && { webhookUrl: "" }),
            ...(redact.has("webhookPersonal") && {
                webhookContent: "",
                webhookEmbedDescription: "",
                excludedGuilds: [],
                excludedChannels: [],
            }),
            onMatch: redact.has("webhookForwarding")
                ? { ...trigger.forwarding.onMatch, enabled: false }
                : trigger.forwarding.onMatch,
            onDetection: redact.has("webhookForwarding")
                ? { ...trigger.forwarding.onDetection, enabled: false }
                : trigger.forwarding.onDetection,
        },
    };
}

export function exportTriggersJsonRedacted(options: ExportOptions = {}): string {
    const redact = new Set(options.redact ?? []);
    const result = _triggers
        .map(t => redactTrigger(t, redact))
        .filter((t): t is Trigger => t !== null);
    return JSON.stringify(result, null, 2);
}

export function downloadTriggersJsonRedacted(options: ExportOptions = {}): void {
    _downloadJson(exportTriggersJsonRedacted(options), `solsradar-triggers-public-${Date.now()}.json`);
}

export function exportTriggerJsonRedacted(trigger: Trigger, options: ExportOptions = {}): string {
    const redact = new Set(options.redact ?? []);
    const result = redactTrigger(trigger, redact);
    return JSON.stringify(result ? [result] : [], null, 2);
}

export function downloadTriggerJsonRedacted(trigger: Trigger, options: ExportOptions = {}): void {
    _downloadJson(exportTriggerJsonRedacted(trigger, options), `solsradar-trigger-public-${_triggerSlug(trigger)}-${Date.now()}.json`);
}

export function safeExportDraft(draft: Omit<Trigger, "id">): Omit<Trigger, "id"> {
    const redact = new Set<RedactField>(["conditions", "bypasses", "webhookUrl", "webhookForwarding", "webhookPersonal"]);
    const { id: _, ...rest } = redactTrigger({ id: "", ...draft }, redact)!;
    return rest;
}

function _downloadJson(content: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
}

export type ImportResult =
    | { ok: true; imported: number; }
    | { ok: false; error: string; };

export async function importTriggersFromJson(json: string, mode: "merge" | "replace" = "merge"): Promise<ImportResult> {
    await triggerStoreReady;

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: "Invalid JSON." };
    }

    if (!Array.isArray(parsed)) {
        return { ok: false, error: "Expected a JSON array of triggers." };
    }

    const valid = (parsed as any[]).filter(t =>
        t && typeof t === "object" &&
        typeof t.name === "string" &&
        typeof t.type === "string" &&
        t.state && t.conditions
    );

    if (valid.length === 0) {
        return { ok: false, error: "No valid triggers found in the file." };
    }

    const incoming = valid.map(t => migrateTrigger({ ...t, id: crypto.randomUUID() }));
    _triggers = mode === "replace" ? incoming : [..._triggers, ...incoming];
    notifyListeners();
    persist();
    return { ok: true, imported: incoming.length };
}

// --- React hook ---

export function useTriggers(): Trigger[] {
    const [triggers, setTriggers] = React.useState<Trigger[]>(_triggers);

    React.useEffect(() => {
        // Triggers may finish loading after the first render
        triggerStoreReady.then(() => setTriggers([..._triggers]));

        const update = () => setTriggers([..._triggers]);
        _listeners.add(update);
        return () => { _listeners.delete(update); };
    }, []);

    return triggers;
}

// Loads triggers once, when the module is imported
(async () => {
    logger.info("Initializing TriggerStore…");

    try {
        const stored = await DataStore.get<any[]>(DATASTORE_KEY);
        logger.debug("Stored triggers:", stored);

        if (Array.isArray(stored) && stored.length > 0) {
            _triggers = stored.map(migrateTrigger);
            logger.info(`Loaded and migrated ${_triggers.length} triggers.`);
            // Save right away so migrated fields are stored
            await DataStore.set(DATASTORE_KEY, _triggers);
        } else {
            _triggers = [];
            logger.info("No stored triggers found, starting empty.");
        }
    } catch (e) {
        logger.error("Failed to load triggers from DataStore:", e);
        _triggers = [];
    } finally {
        _resolveReady();
        notifyListeners();
    }
})();
