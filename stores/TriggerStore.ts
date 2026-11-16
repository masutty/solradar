/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/* eslint-disable @stylistic/no-multi-spaces */

import { DataStore } from "@api/index";
import { React } from "@webpack/common";

import { Logger } from "../logger";
import { applyDefaultUpdate, DEFAULT_TRIGGERS, getDefault, isDefaultId, isUpdatable } from "./defaultTriggers";
import { adoptIcon, inlineIcon } from "./IconStore";

const logger = new Logger("SolRadar");

// --- Types ---

export type TriggerType = "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";

/** Types whose biome can be checked after joining. The editor and the biome watcher both use this. */
export const hasBiomeCheck = (type: TriggerType) => type !== "MERCHANT";

/** Whether a trigger can show a verified / not verified status: a biome type with detection set up */
export const hasBiomeStatus = (t: { type: TriggerType; biome?: { detectionEnabled: boolean; }; }) =>
    hasBiomeCheck(t.type) && Boolean(t.biome?.detectionEnabled);

/** Whether the join lock for this trigger lasts until its biome ends. Needs a working detector, since nothing else could release it. */
export const locksUntilBiomeEnds = (
    t: { type: TriggerType; biome?: { detectionEnabled: boolean; lockUntilEnd: boolean; }; },
    detector: { enabled: boolean; accounts: string; },
) => detector.enabled && Boolean(detector.accounts.trim()) && hasBiomeStatus(t) && Boolean(t.biome?.lockUntilEnd);

/** The biomes a trigger accepts: the comma-separated keyword, or the trigger name when the keyword is empty. */
export function expectedBiomes(t: { name: string; biome?: { detectionKeyword: string; }; }): string[] {
    const parts = (t.biome?.detectionKeyword ?? "").split(",").map(p => p.trim().toUpperCase()).filter(Boolean);
    return parts.length ? parts : [t.name.trim().toUpperCase()];
}

export const formatBiomes = (biomes: string[]) => biomes.join(" or ");

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
    inGuild: string[]; // empty = ignore check
    ignoredChannels: string[];
    ignoredGuilds: string[];
    ignoredUsers: string[];
    ignoreEdits: boolean; // never fire on edited messages
    // Each bypass skips one global check for this trigger
    bypassMatchAmbiguity: boolean; // several triggers matched
    bypassMonitoredOnly: boolean; // monitored servers/channels
    bypassIgnoredGuilds: boolean; // ignored servers
    bypassForwardIgnoredGuilds: boolean; // no-forward servers
    bypassIgnoredChannels: boolean; // ignored channels
    bypassIgnoredUsers: boolean; // ignored users
    bypassLinkVerification: boolean; // allowed place IDs
    bypassLinkDeduplication: boolean; // repeated links
    bypassGlobalExclude: boolean; // global "Must not contain" words
}

/** Where a trigger or folder runs. Empty lists set nothing. */
export type ScopeRules = {
    onlyServers: string[];
    onlyChannels: string[];
    onlyUsers: string[];
    neverServers: string[];
    neverChannels: string[];
    neverUsers: string[];
};

export type BypassKey =
    | "bypassMatchAmbiguity"
    | "bypassMonitoredOnly"
    | "bypassIgnoredGuilds"
    | "bypassForwardIgnoredGuilds"
    | "bypassIgnoredChannels"
    | "bypassIgnoredUsers"
    | "bypassLinkVerification"
    | "bypassLinkDeduplication"
    | "bypassGlobalExclude";

const SCOPE_KEYS: (keyof ScopeRules)[] = ["onlyServers", "onlyChannels", "onlyUsers", "neverServers", "neverChannels", "neverUsers"];
const BYPASS_KEYS: BypassKey[] = [
    "bypassMatchAmbiguity", "bypassMonitoredOnly", "bypassIgnoredGuilds", "bypassForwardIgnoredGuilds", "bypassIgnoredChannels",
    "bypassIgnoredUsers", "bypassLinkVerification", "bypassLinkDeduplication", "bypassGlobalExclude",
];

export interface TriggerBiome {
    detectionEnabled: boolean;
    detectionKeyword: string;
    skipRedundantJoin: boolean;
    /** Keeps the join lock until the biome ends, instead of for joinlockDuration */
    lockUntilEnd: boolean;
}

/** Message formats a forward can use: a classic embed, or a Components V2 card */
export type ForwardFormat = "embed" | "card";
export type CardLayout = "compact" | "quote" | "terminal" | "timeline" | "actions";
const CARD_LAYOUT_IDS: CardLayout[] = ["compact", "quote", "terminal", "timeline", "actions"];

/** Parts of a forwarded message the user can leave out. Each layout uses only some of them. */
export interface ForwardShow {
    icon: boolean;
    time: boolean;
    sender: boolean;
    where: boolean;
    biome: boolean;
    message: boolean;
    join: boolean;
    jump: boolean;
}

/** Stripe color of a trigger's forwards, by type. Also used by the editor's type picker. */
export const TYPE_COLORS: Record<TriggerType, string> = {
    RARE_BIOME: "#f23f43",
    EVENT_BIOME: "#3ba55d",
    BIOME: "#eb459e",
    WEATHER: "#00a8fc",
    MERCHANT: "#f0b232",
    CUSTOM: "#949ba4",
};

export interface TriggerForwarding {
    webhookUrl: string;
    webhookContent: string;
    /** The text under the title of a card or embed */
    webhookEmbedDescription: string;
    format: ForwardFormat;
    layout: CardLayout;
    /** "#rrggbb", or empty for the color of the trigger's type */
    accentColor: string;
    show: ForwardShow;
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
    /** Kept out of the trigger list unless the list is filtered with hidden:yes */
    hidden?: boolean;
    state: TriggerState;
    conditions: TriggerConditions;
    forwarding: TriggerForwarding;
    biome?: TriggerBiome;
    /** Rev of the default this trigger was imported or last updated from. Absent on user-made triggers. */
    defaultRev?: number;
    folderId?: string;
}

export interface TriggerFolder {
    id: string;
    name: string;
    description: string;
    color: string;
    /** Kept out of the list with its triggers, like a hidden trigger. Still runs. */
    hidden?: boolean;
    /** Stops every trigger inside, without touching their own on/off */
    paused?: boolean;
    collapsed?: boolean;
    rules?: Partial<ScopeRules>;
    bypasses?: Partial<Record<BypassKey, boolean>>;
}

/** What an exported trigger carries about its folder, so an import can put it back in one */
export type ExportedFolder = Pick<TriggerFolder, "id" | "name" | "description" | "color" | "hidden" | "paused" | "rules" | "bypasses">;

export type ImportedTrigger = Trigger & { rev?: number; folder?: ExportedFolder; };

export const FOLDER_NAME_MAX = 32;
export const FOLDER_DESC_MAX = 100;
export const FOLDER_COLORS = ["#5865f2", "#00a8fc", "#3ba55c", "#f0b232", "#e67e22", "#f23f43", "#eb459e", "#9b59b6", "#949ba4"];

// --- Defaults ---

const DATASTORE_KEY = "SolsRadar_Triggers";
const FOLDERS_KEY = "SolsRadar_TriggerFolders";

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
    inGuild: [],
    ignoredChannels: [],
    ignoredGuilds: [],
    ignoredUsers: [],
    ignoreEdits: false,
    bypassMatchAmbiguity: false,
    bypassMonitoredOnly: false,
    bypassIgnoredGuilds: false,
    bypassForwardIgnoredGuilds: false,
    bypassIgnoredChannels: false,
    bypassIgnoredUsers: false,
    bypassLinkVerification: false,
    bypassLinkDeduplication: false,
    bypassGlobalExclude: false,
};

export const DEFAULT_BIOME: TriggerBiome = {
    detectionEnabled: true,
    detectionKeyword: "",
    skipRedundantJoin: true,
    lockUntilEnd: false,
};

export const DEFAULT_FORWARD_SHOW: ForwardShow = {
    icon: true,
    time: true,
    sender: true,
    where: true,
    biome: true,
    message: true,
    join: true,
    jump: true,
};

export const DEFAULT_FORWARDING: TriggerForwarding = {
    webhookUrl: "",
    webhookContent: "",
    webhookEmbedDescription: "",
    format: "embed",
    layout: "compact",
    accentColor: "",
    show: { ...DEFAULT_FORWARD_SHOW },
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
    const trigger: Trigger = {
        id: raw.id ?? crypto.randomUUID(),
        type: raw.type ?? "CUSTOM",
        name: raw.name ?? "",
        description: raw.description ?? "",
        iconUrl: adoptIcon(raw.iconUrl ?? ""),
        biome: {
            detectionEnabled: raw.biome?.detectionEnabled ?? DEFAULT_BIOME.detectionEnabled,
            detectionKeyword: raw.biome?.detectionKeyword ?? DEFAULT_BIOME.detectionKeyword,
            skipRedundantJoin: raw.biome?.skipRedundantJoin ?? DEFAULT_BIOME.skipRedundantJoin,
            lockUntilEnd: raw.biome?.lockUntilEnd ?? DEFAULT_BIOME.lockUntilEnd,
        },
        conditions: {
            keywords: {
                match: raw.conditions?.keywords?.match ?? { strict: false, value: [] },
                exclude: raw.conditions?.keywords?.exclude ?? { strict: false, value: [] },
            },
            mentionRoles: raw.conditions?.mentionRoles ?? [],
            fromUser: raw.conditions?.fromUser ?? [],
            inChannel: raw.conditions?.inChannel ?? [],
            inGuild: raw.conditions?.inGuild ?? [],
            ignoredChannels: raw.conditions?.ignoredChannels ?? [],
            ignoredGuilds: raw.conditions?.ignoredGuilds ?? [],
            ignoredUsers: raw.conditions?.ignoredUsers ?? [],
            ignoreEdits: raw.conditions?.ignoreEdits ?? false,
            bypassMatchAmbiguity: raw.conditions?.bypassMatchAmbiguity ?? false,
            bypassMonitoredOnly: raw.conditions?.bypassMonitoredOnly ?? false,
            bypassIgnoredGuilds: raw.conditions?.bypassIgnoredGuilds ?? false,
            bypassForwardIgnoredGuilds: raw.conditions?.bypassForwardIgnoredGuilds ?? false,
            bypassIgnoredChannels: raw.conditions?.bypassIgnoredChannels ?? false,
            bypassIgnoredUsers: raw.conditions?.bypassIgnoredUsers ?? false,
            bypassLinkVerification: raw.conditions?.bypassLinkVerification ?? false,
            bypassLinkDeduplication: raw.conditions?.bypassLinkDeduplication ?? false,
            bypassGlobalExclude: raw.conditions?.bypassGlobalExclude ?? false,
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
            format: raw.forwarding?.format === "card" ? "card" : "embed",
            layout: CARD_LAYOUT_IDS.includes(raw.forwarding?.layout) ? raw.forwarding.layout : DEFAULT_FORWARDING.layout,
            accentColor: raw.forwarding?.accentColor ?? DEFAULT_FORWARDING.accentColor,
            show: { ...DEFAULT_FORWARD_SHOW, ...raw.forwarding?.show },
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

    if (!hasBiomeCheck(trigger.type)) trigger.forwarding.onDetection.enabled = false;
    if (raw.hidden === true) trigger.hidden = true;
    if (Number.isFinite(raw.defaultRev)) trigger.defaultRev = raw.defaultRev;
    if (typeof raw.folderId === "string" && raw.folderId) trigger.folderId = raw.folderId;
    return trigger;
}

const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Cleans a stored or imported folder. Returns null when it has no usable id. */
export function migrateFolder(raw: any): TriggerFolder | null {
    if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !raw.id) return null;
    const folder: TriggerFolder = {
        id: raw.id,
        name: String(raw.name ?? "").slice(0, FOLDER_NAME_MAX).trim() || "Untitled folder",
        description: String(raw.description ?? "").slice(0, FOLDER_DESC_MAX),
        color: isColor(raw.color) ? raw.color : FOLDER_COLORS[0],
    };
    if (raw.hidden === true) folder.hidden = true;
    if (raw.paused === true) folder.paused = true;
    if (raw.collapsed === true) folder.collapsed = true;

    const rules: Partial<ScopeRules> = {};
    for (const key of SCOPE_KEYS) {
        const list = Array.isArray(raw.rules?.[key]) ? raw.rules[key].filter((v: unknown) => typeof v === "string" && v) : [];
        if (list.length) rules[key] = list;
    }
    if (Object.keys(rules).length) folder.rules = rules;

    const bypasses: Partial<Record<BypassKey, boolean>> = {};
    for (const key of BYPASS_KEYS) if (raw.bypasses?.[key] === true) bypasses[key] = true;
    if (Object.keys(bypasses).length) folder.bypasses = bypasses;
    return folder;
}

// --- Default ids ---
// TODO: temporary migration, remove once users have updated (reminder in the Developer tab).
// Old copies of defaults have random ids. Give them the default's id so we know which ones the user has.
// Idempotent, runs on every load.

function adoptDefaultIds(list: Trigger[]): number {
    const counts = new Map<string, number>();
    for (const d of DEFAULT_TRIGGERS) if (d.iconUrl) counts.set(d.iconUrl, (counts.get(d.iconUrl) ?? 0) + 1);
    const byIcon = new Map(DEFAULT_TRIGGERS.filter(d => d.iconUrl && counts.get(d.iconUrl) === 1).map(d => [d.iconUrl, d]));

    const taken = new Set(list.map(t => t.id));
    let adopted = 0;

    for (const t of list) {
        if (isDefaultId(t.id)) continue;
        const def = byIcon.get(t.iconUrl);
        if (!def || taken.has(def.id)) continue;
        t.id = def.id;
        t.defaultRev = t.defaultRev ?? 1;
        taken.add(def.id);
        adopted++;
    }

    // Safety net: ids must stay unique
    const seen = new Set<string>();
    for (const t of list) {
        if (seen.has(t.id)) t.id = crypto.randomUUID();
        seen.add(t.id);
    }

    // TODO: temporary, remove with the migration above. Revs only go up, so a defaultRev above today's rev was saved by an old fake: bring it back down
    for (const t of list) {
        const def = getDefault(t.id);
        if (def && (t.defaultRev ?? 0) > def.rev) t.defaultRev = def.rev;
    }

    return adopted;
}

// --- Internal store ---

let _triggers: Trigger[] = [];
let _folders: TriggerFolder[] = [];
/** Saved top-level order. Read it through getLayout(), which drops stale ids and adds new ones. */
let _layout: string[] = [];
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

function persistFolders(): void {
    _writeQueue = _writeQueue.then(async () => {
        try {
            await DataStore.set(FOLDERS_KEY, { folders: _folders, layout: getLayout() });
        } catch (e) {
            logger.error("Failed to persist trigger folders:", e);
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

export function getFolders(): TriggerFolder[] {
    return _folders;
}

export function getFolder(id: string | undefined): TriggerFolder | undefined {
    return id ? _folders.find(f => f.id === id) : undefined;
}

/** On and not inside a paused folder */
export function isTriggerRunning(t: Trigger): boolean {
    return t.state.enabled && !getFolder(t.folderId)?.paused;
}

/** Hidden itself, or inside a hidden folder */
export function isTriggerHidden(t: Trigger): boolean {
    return !!t.hidden || !!getFolder(t.folderId)?.hidden;
}

export function getActiveTriggers(): Trigger[] {
    return _triggers.filter(isTriggerRunning);
}

export function getTriggersWithOnMatchForwarding(): Trigger[] {
    return _triggers.filter(t => isTriggerRunning(t) && t.forwarding.onMatch.enabled);
}

export function getTriggersWithOnDetectionForwarding(): Trigger[] {
    return _triggers.filter(t => isTriggerRunning(t) && t.forwarding.onDetection.enabled);
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

export async function deleteAllTriggers(): Promise<void> {
    await triggerStoreReady;
    _triggers = [];
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

// --- Top-level order ---
// Folders and triggers outside folders share one list, in any order. Triggers inside a folder keep the order of _triggers.

/** Ids of folders and of triggers outside folders, in display order */
export function getLayout(): string[] {
    const folderIds = new Set(_folders.map(f => f.id));
    const loose = _triggers.filter(t => !t.folderId || !folderIds.has(t.folderId)).map(t => t.id);
    const looseIds = new Set(loose);
    const seen = new Set<string>();
    const out = _layout.filter(id => (folderIds.has(id) || looseIds.has(id)) && !seen.has(id) && !!seen.add(id));
    // Anything new goes last: triggers first, so a list saved before folders existed keeps its look
    for (const id of loose) if (!seen.has(id)) out.push(id);
    for (const f of _folders) if (!seen.has(f.id)) out.push(f.id);
    return out;
}

/** Puts `key` (a folder or a trigger outside folders) right before `beforeKey`, or last without it */
function placeInLayout(layout: string[], key: string, beforeKey: string | null): string[] {
    const out = layout.filter(k => k !== key);
    const at = beforeKey ? out.indexOf(beforeKey) : -1;
    out.splice(at === -1 ? out.length : at, 0, key);
    return out;
}

/**
 * Moves a trigger into a folder, right before the trigger `beforeKey`, or last in it without one.
 * With `folderId` null it goes outside folders, right before `beforeKey` (a trigger or a folder), or last.
 */
export async function moveTrigger(id: string, folderId: string | null, beforeKey: string | null = null): Promise<void> {
    await triggerStoreReady;
    const from = _triggers.findIndex(t => t.id === id);
    if (from === -1 || beforeKey === id) return;

    const layout = getLayout();
    const list = [..._triggers];
    const [moved] = list.splice(from, 1);
    const t: Trigger = { ...moved };

    if (folderId) {
        t.folderId = folderId;
        let at = beforeKey ? list.findIndex(x => x.id === beforeKey) : -1;
        if (at === -1) {
            let last = -1;
            list.forEach((x, i) => { if (x.folderId === folderId) last = i; });
            at = last === -1 ? list.length : last + 1;
        }
        list.splice(at, 0, t);
        _layout = layout.filter(k => k !== id);
    } else {
        delete t.folderId;
        list.splice(from, 0, t);
        _layout = placeInLayout(layout, id, beforeKey);
    }

    _triggers = list;
    notifyListeners();
    persist();
    persistFolders();
}

/** Creates a folder, right before `beforeKey` in the list or last without it */
export async function createFolder(data: Omit<TriggerFolder, "id">, beforeKey: string | null = null): Promise<TriggerFolder> {
    await triggerStoreReady;
    const folder: TriggerFolder = { id: crypto.randomUUID(), ...data };
    const layout = getLayout();
    _folders = [..._folders, folder];
    _layout = placeInLayout(layout, folder.id, beforeKey);
    notifyListeners();
    persistFolders();
    return folder;
}

export async function updateFolder(id: string, patch: Partial<Omit<TriggerFolder, "id">>): Promise<void> {
    await triggerStoreReady;
    _folders = _folders.map(f => f.id === id ? { ...f, ...patch } : f);
    notifyListeners();
    persistFolders();
}

/** Deletes a folder. Its triggers take its place in the list, or go with it when `withTriggers` is set. */
export async function deleteFolder(id: string, withTriggers: boolean): Promise<void> {
    await triggerStoreReady;
    const layout = getLayout();
    const inside = _triggers.filter(t => t.folderId === id).map(t => t.id);
    const at = layout.indexOf(id);
    if (!withTriggers && at !== -1) layout.splice(at, 1, ...inside);

    _folders = _folders.filter(f => f.id !== id);
    _layout = layout.filter(k => k !== id);
    _triggers = withTriggers
        ? _triggers.filter(t => t.folderId !== id)
        : _triggers.map(t => {
            if (t.folderId !== id) return t;
            const { folderId: _, ...rest } = t;
            return rest;
        });
    notifyListeners();
    persistFolders();
    persist();
}

/** Puts a folder right before `beforeKey` (a folder or a trigger outside folders), or last without it */
export async function moveFolder(id: string, beforeKey: string | null): Promise<void> {
    await triggerStoreReady;
    if (!getFolder(id) || beforeKey === id) return;
    _layout = placeInLayout(getLayout(), id, beforeKey);
    notifyListeners();
    persistFolders();
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

    // A copy outside folders goes right under the original in the list too
    const layout = getLayout();
    const at = layout.indexOf(id);
    if (at !== -1) {
        layout.splice(at + 1, 0, copy.id);
        _layout = layout;
        persistFolders();
    }

    _triggers = [..._triggers.slice(0, idx + 1), copy, ..._triggers.slice(idx + 1)];
    notifyListeners();
    persist();
    return copy;
}

/** Copies a folder and its triggers right after it. The copy starts paused. */
export async function duplicateFolder(id: string): Promise<TriggerFolder | undefined> {
    await triggerStoreReady;
    const src = getFolder(id);
    if (!src) return undefined;

    const copy: TriggerFolder = {
        ...structuredClone(src),
        id: crypto.randomUUID(),
        name: `${src.name.slice(0, FOLDER_NAME_MAX - " (copy)".length)} (copy)`,
        paused: true,
    };
    delete copy.collapsed;

    const copies = _triggers
        .filter(t => t.folderId === id)
        .map((t): Trigger => ({ ...structuredClone(t), id: crypto.randomUUID(), folderId: copy.id }));

    const layout = getLayout();
    const at = layout.indexOf(id);
    layout.splice(at === -1 ? layout.length : at + 1, 0, copy.id);

    _folders = [..._folders, copy];
    _layout = layout;
    _triggers = [..._triggers, ...copies];
    notifyListeners();
    persistFolders();
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

function exportedFolder(f: TriggerFolder, redact?: Set<RedactField>): ExportedFolder {
    const out: ExportedFolder = { id: f.id, name: f.name, description: f.description, color: f.color };
    if (!redact && f.hidden) out.hidden = true;
    if (!redact && f.paused) out.paused = true;
    if (f.rules && !redact?.has("conditions")) out.rules = { ...f.rules };
    if (f.bypasses && !redact?.has("bypasses")) out.bypasses = { ...f.bypasses };
    return out;
}

/**
 * The file is still a plain array, so older versions keep reading it. A trigger in a folder carries
 * the folder itself instead of its id. Safe exports leave out the folder's paused and hidden state.
 */
function fileShape(t: Trigger, redact?: Set<RedactField>): object | null {
    const r = redact ? redactTrigger(t, redact) : withInlineIcon(t);
    if (!r) return null;
    const { folderId, ...rest } = r;
    const f = getFolder(folderId);
    return f ? { ...rest, folder: exportedFolder(f, redact) } : rest;
}

function serialize(list: Trigger[], redact?: Set<RedactField>): string {
    return JSON.stringify(list.map(t => fileShape(t, redact)).filter(Boolean), null, 2);
}

/** A trigger as it is written to a file, without its id */
export function exportShape(trigger: Trigger): object {
    const { id: _, ...shape } = fileShape(trigger) as Trigger;
    return shape;
}

export function exportTriggersJson(): string {
    return serialize(_triggers);
}

const folderTriggers = (folder: TriggerFolder) => _triggers.filter(t => t.folderId === folder.id);
const _folderSlug = (folder: TriggerFolder) => folder.name.trim().replace(/\s+/g, "-").toLowerCase() || "folder";

export function exportFolderJson(folder: TriggerFolder): string {
    return serialize(folderTriggers(folder));
}

export function downloadFolderJson(folder: TriggerFolder): void {
    _downloadJson(exportFolderJson(folder), `solsradar-folder-${_folderSlug(folder)}-${Date.now()}.json`);
}

export function downloadFolderJsonRedacted(folder: TriggerFolder, options: ExportOptions = {}): void {
    _downloadJson(serialize(folderTriggers(folder), new Set(options.redact ?? [])), `solsradar-folder-public-${_folderSlug(folder)}-${Date.now()}.json`);
}

export function downloadTriggersJson(): void {
    _downloadJson(exportTriggersJson(), `solsradar-triggers-${Date.now()}.json`);
}

function _triggerSlug(trigger: Trigger): string {
    return trigger.name.trim().replace(/\s+/g, "-").toLowerCase() || "unnamed";
}

export function exportTriggerJson(trigger: Trigger): string {
    return serialize([trigger]);
}

export function downloadTriggerJson(trigger: Trigger): void {
    _downloadJson(exportTriggerJson(trigger), `solsradar-trigger-${_triggerSlug(trigger)}-${Date.now()}.json`);
}

/** Exports carry the picture itself, since a local icon means nothing on another machine */
export function withInlineIcon<T extends { iconUrl: string; }>(trigger: T): T {
    return { ...trigger, iconUrl: inlineIcon(trigger.iconUrl) };
}

function redactTrigger(trigger: Trigger, redact: Set<RedactField>): Trigger | null {
    if (redact.has("customTriggers") && trigger.type === "CUSTOM") return null;

    return {
        ...withInlineIcon(trigger),
        conditions: {
            ...trigger.conditions,
            ...(redact.has("conditions") && { fromUser: [], inChannel: [], inGuild: [], ignoredChannels: [], ignoredGuilds: [], ignoredUsers: [], mentionRoles: [] }),
            ...(redact.has("bypasses") && {
                bypassMatchAmbiguity: false,
                bypassMonitoredOnly: false,
                bypassIgnoredGuilds: false,
                bypassForwardIgnoredGuilds: false,
                bypassIgnoredChannels: false,
                bypassIgnoredUsers: false,
                bypassLinkVerification: false,
                bypassLinkDeduplication: false,
                bypassGlobalExclude: false,
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
    return serialize(_triggers, new Set(options.redact ?? []));
}

export function downloadTriggersJsonRedacted(options: ExportOptions = {}): void {
    _downloadJson(exportTriggersJsonRedacted(options), `solsradar-triggers-public-${Date.now()}.json`);
}

export function exportTriggerJsonRedacted(trigger: Trigger, options: ExportOptions = {}): string {
    return serialize([trigger], new Set(options.redact ?? []));
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

export type ParseResult =
    | { ok: true; triggers: ImportedTrigger[]; }
    | { ok: false; error: string; };

/** Validates an exported triggers file. Does not touch the store. */
export function parseTriggersFile(json: string): ParseResult {
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

    // The picker tells triggers apart by id, so a file can't repeat one
    const ids = new Set<string>();
    const triggers = valid.map(raw => {
        const t: ImportedTrigger = migrateTrigger(raw);
        // Folders travel as the folder itself, never as an id from someone else's list
        delete t.folderId;
        const folder = migrateFolder(raw.folder);
        if (folder) t.folder = exportedFolder(folder);
        if (ids.has(t.id)) t.id = crypto.randomUUID();
        ids.add(t.id);
        return t;
    });
    return { ok: true, triggers };
}

/**
 * Appends triggers. An id is kept when nothing else uses it, so defaults stay recognisable. Returns how many were added.
 * A trigger that carries a folder goes into the user's folder with that id, created when they don't have it.
 */
export async function importTriggers(incoming: ImportedTrigger[]): Promise<number> {
    await triggerStoreReady;

    const used = new Set(_triggers.map(t => t.id));
    const newFolders: TriggerFolder[] = [];
    const added = incoming.map(raw => {
        const t = migrateTrigger(raw);
        const keep = typeof raw.id === "string" && raw.id !== "" && !used.has(raw.id);
        t.id = keep ? raw.id : crypto.randomUUID();
        used.add(t.id);
        // Only defaults carry a rev, and a fresh copy starts on it
        const def = keep && Number.isFinite(raw.rev) ? getDefault(t.id) : undefined;
        if (def) t.defaultRev = def.rev;

        delete t.folderId;
        const folder = migrateFolder(raw.folder);
        if (folder) {
            if (!getFolder(folder.id) && !newFolders.some(f => f.id === folder.id)) newFolders.push(folder);
            t.folderId = folder.id;
        }
        return t;
    });

    if (added.length === 0) return 0;
    if (newFolders.length) {
        _folders = [..._folders, ...newFolders];
        persistFolders();
    }
    _triggers = [..._triggers, ...added];
    notifyListeners();
    persist();
    return added.length;
}

/** Brings the user's copies of these defaults up to date. Returns how many changed. */
export async function updateFromDefaults(ids: string[]): Promise<number> {
    await triggerStoreReady;

    let updated = 0;
    _triggers = _triggers.map(t => {
        const def = getDefault(t.id);
        if (!def || !ids.includes(t.id) || !isUpdatable(t)) return t;
        updated++;
        return applyDefaultUpdate(t, def);
    });

    if (updated > 0) {
        notifyListeners();
        persist();
    }
    return updated;
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

export function useFolders(): TriggerFolder[] {
    const [folders, setFolders] = React.useState<TriggerFolder[]>(_folders);

    React.useEffect(() => {
        triggerStoreReady.then(() => setFolders([..._folders]));

        const update = () => setFolders([..._folders]);
        _listeners.add(update);
        return () => { _listeners.delete(update); };
    }, []);

    return folders;
}

// Loads triggers once, when the module is imported
(async () => {
    logger.info("Initializing TriggerStore…");

    // Only after a good read may a missing folder free its triggers, or a failed read would empty every folder
    let foldersLoaded = false;
    try {
        const stored = await DataStore.get<any>(FOLDERS_KEY);
        // Early builds saved only the folder array
        const rawFolders = Array.isArray(stored) ? stored : stored?.folders;
        if (Array.isArray(rawFolders)) {
            const seen = new Set<string>();
            _folders = rawFolders.map(migrateFolder).filter((f): f is TriggerFolder => !!f && !seen.has(f.id) && !!seen.add(f.id));
        }
        if (Array.isArray(stored?.layout)) _layout = stored.layout.filter((k: unknown): k is string => typeof k === "string");
        foldersLoaded = true;
    } catch (e) {
        logger.error("Failed to load trigger folders from DataStore:", e);
    }

    try {
        const stored = await DataStore.get<any[]>(DATASTORE_KEY);
        logger.debug("Stored triggers:", stored);

        if (Array.isArray(stored) && stored.length > 0) {
            _triggers = stored.map(migrateTrigger);
            // A folder that is gone leaves its triggers outside every folder
            if (foldersLoaded) for (const t of _triggers) if (t.folderId && !getFolder(t.folderId)) delete t.folderId;
            logger.info(`Loaded and migrated ${_triggers.length} triggers.`);
            const adopted = adoptDefaultIds(_triggers);
            if (adopted > 0) logger.info(`Matched ${adopted} triggers to their default.`);
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
