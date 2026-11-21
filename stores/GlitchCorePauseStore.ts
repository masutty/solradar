/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

// --- Types ---

export interface GlitchCorePause {
    /** When the pause ends (ms timestamp). */
    until: number;
    /** What tripped it, as a phrase: "The Core didn't reply". */
    cause: string;
    durationMs: number;
}

type Listener = (pause: GlitchCorePause | null) => void;

// --- Store ---

let pause: GlitchCorePause | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

function notify() {
    for (const fn of listeners) {
        try { fn(pause); } catch (e) { console.error("[GlitchCorePauseStore] Listener error:", e); }
    }
}

function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pause = null;
}

export const GlitchCorePauseStore = {
    /** Expired pauses are cleared when read. */
    get current(): GlitchCorePause | null {
        if (pause && Date.now() >= pause.until) clear();
        return pause;
    },

    msRemaining(): number {
        const p = GlitchCorePauseStore.current;
        return p ? p.until - Date.now() : 0;
    },

    start(cause: string, durationMs: number) {
        clear();
        pause = { until: Date.now() + durationMs, cause, durationMs };
        timer = setTimeout(() => {
            clear();
            notify();
        }, durationMs);
        notify();
    },

    resume() {
        if (!pause) return;
        clear();
        notify();
    },

    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

// --- React hook ---

export function useGlitchCorePause(): GlitchCorePause | null {
    const [state, setState] = React.useState<GlitchCorePause | null>(GlitchCorePauseStore.current);

    React.useEffect(() => {
        setState(GlitchCorePauseStore.current);
        return GlitchCorePauseStore.subscribe(setState);
    }, []);

    return state;
}
