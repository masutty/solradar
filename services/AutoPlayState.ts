/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export type AutoPlayState = {
    status: "idle" | "waiting" | "tapping";
    taps: number;
    lastTapAt: number | null;
    /** What it is doing right now, or null when idle. */
    note: string | null;
    /** Why the last run ended, or null while it runs. */
    endedBecause: string | null;
};

export type AutoPlayStore = ReturnType<typeof createAutoPlayStore>;

/** The live state of one auto-play (emulator or Windows) that the UI can watch. */
export function createAutoPlayStore() {
    let state: AutoPlayState = { status: "idle", taps: 0, lastTapAt: null, note: null, endedBecause: null };
    let run = 0;
    const listeners = new Set<(s: AutoPlayState) => void>();

    const update = (patch: Partial<AutoPlayState>) => {
        state = { ...state, ...patch };
        listeners.forEach(fn => fn(state));
    };

    return {
        get: () => state,
        update,
        subscribe(fn: (s: AutoPlayState) => void) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        /** Starts a new run and returns its token. Starting cancels the run before it. */
        begin(note: string): number {
            run++;
            update({ status: "waiting", taps: 0, lastTapAt: null, note, endedBecause: null });
            return run;
        },
        isCurrent: (token: number) => token === run,
        /** Ends the run. Returns false when nothing was running. */
        end(reason: string): boolean {
            if (state.status === "idle") return false;
            run++;
            update({ status: "idle", note: null, endedBecause: reason });
            return true;
        },
    };
}

export function useAutoPlayState(store: AutoPlayStore): AutoPlayState {
    const [current, setCurrent] = React.useState(store.get());

    React.useEffect(() => {
        setCurrent(store.get());
        return store.subscribe(setCurrent);
    }, [store]);

    return current;
}
