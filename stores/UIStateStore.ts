/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { localStorage } from "@utils/localStorage";

import { SnipeTag } from "../types";

const STORAGE_KEY = "vc-sora-ui-state";

// --- Types ---

export type ModalTab = "recentJoins" | "triggers" | "settings" | "about" | "dev" | "stats" | "utilities" | "updates" | "testtab2" | "testtab3";
export type TriggerFilter = "all" | "RARE_BIOME" | "EVENT_BIOME" | "BIOME" | "WEATHER" | "MERCHANT" | "CUSTOM";
export type JoinFilter = SnipeTag | "all";

/** User overrides for an EditableActionButton. Undefined means the button's default. */
export interface EabData {
    label?: string;
    value?: string;
}

interface UIState {
    activeTab: ModalTab;
    triggers: { typeFilter: TriggerFilter; search: string; };
    recentJoins: { tagFilter: JoinFilter; search: string; };
    /** Keyed by button id. */
    eabValues: Record<string, EabData>;
    /** Which Settings blocks are open, keyed by block id. Missing means the block's default. */
    settingsBlocks: Record<string, boolean>;
    /** Layout of the Snipe Debug window. */
    debugView: "checklist" | "trace";
}

// --- Defaults ---

const DEFAULTS: UIState = {
    activeTab: "recentJoins",
    triggers: { typeFilter: "all", search: "" },
    recentJoins: { tagFilter: "all", search: "" },
    eabValues: {},
    settingsBlocks: {},
    debugView: "checklist",
};

// --- Store ---

class UIStateStore {
    private _state: UIState = this._load();

    get<K extends keyof UIState>(key: K): UIState[K] {
        return this._state[key];
    }

    /**
     * Updates a key and saves. Object values are merged, so a partial patch works.
     *
     * @example
     * UIState.set("activeTab", "triggers");
     * UIState.set("triggers", { typeFilter: "RARE_BIOME" });
     */
    set<K extends keyof UIState>(
        key: K,
        value: UIState[K] extends object ? Partial<UIState[K]> : UIState[K]
    ): void {
        const current = this._state[key];
        this._state[key] = (
            current !== null && typeof current === "object"
                ? { ...current as object, ...value as object }
                : value
        ) as UIState[K];
        this._save();
    }

    // --- EAB helpers ---

    getEab(id: string): EabData {
        return this._state.eabValues[id] ?? {};
    }

    /**
     * Merges a patch into a button's overrides and saves. Pass undefined to reset a field.
     *
     * @example
     * UIState.setEab("my-btn", { label: "Launch game" });
     * UIState.setEab("my-btn", { value: undefined }); // resets only the value
     */
    setEab(id: string, patch: Partial<EabData>): void {
        const current = this._state.eabValues[id] ?? {};
        const next: EabData = { ...current, ...patch };

        if (next.label === undefined) delete next.label;
        if (next.value === undefined) delete next.value;

        // Nothing left to override, drop the entry
        if (Object.keys(next).length === 0) {
            const { [id]: _, ...rest } = this._state.eabValues;
            this._state.eabValues = rest;
        } else {
            this._state.eabValues = { ...this._state.eabValues, [id]: next };
        }

        this._save();
    }

    private _save(): void {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state)); }
        catch (e) { console.error("[UIStateStore] save failed:", e); }
    }

    private _load(): UIState {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return structuredClone(DEFAULTS);
            const saved = JSON.parse(raw) as Partial<UIState>;

            return {
                activeTab: saved.activeTab ?? DEFAULTS.activeTab,
                triggers: { ...DEFAULTS.triggers, ...saved.triggers },
                recentJoins: { ...DEFAULTS.recentJoins, ...saved.recentJoins },
                eabValues: saved.eabValues ?? {},
                settingsBlocks: saved.settingsBlocks ?? {},
                debugView: saved.debugView ?? DEFAULTS.debugView,
            };
        } catch (e) {
            console.error("[UIStateStore] load failed, using defaults:", e);
            return structuredClone(DEFAULTS);
        }
    }
}

export const UIState = new UIStateStore();
