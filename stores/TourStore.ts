/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, showToast } from "@webpack/common";

import type { Tour, TourEndReason, TourStep } from "../components/tour/types";
import { Logger } from "../logger";
import { settings } from "../settings";
import { UIState } from "./UIStateStore";

const logger = new Logger("SolRadar/Tour");

export interface TourSnapshot {
    tour: Tour | null;
    index: number;
    /** Changes every time a tour ends visibly, drives the replay button pulse. */
    endedAt: number;
    /** Id of the tour that ended last, so only its replay button reacts. */
    endedTour: string | null;
}

type Listener = (s: TourSnapshot) => void;

// --- State ---

let tour: Tour | null = null;
let index = -1;
let ran = new Set<string>();
let endedAt = 0;
let endedTour: string | null = null;
const listeners = new Set<Listener>();
const ctx = { ran: (id: string) => ran.has(id) };

function snapshot(): TourSnapshot {
    return { tour, index, endedAt, endedTour };
}

function notify() {
    const s = snapshot();
    listeners.forEach(fn => {
        try { fn(s); } catch (e) { logger.error("Listener error:", e); }
    });
}

function safe(fn: (() => void) | undefined, what: string) {
    if (!fn) return;
    try { fn(); } catch (e) { logger.error(`${what} failed:`, e); }
}

function eligible(step: TourStep): boolean {
    if (!step.when) return true;
    try { return step.when(ctx); } catch (e) {
        logger.error(`when() failed for ${step.id}:`, e);
        return false;
    }
}

function findStep(from: number, dir: 1 | -1): number {
    if (!tour) return -1;
    for (let i = from + dir; i >= 0 && i < tour.steps.length; i += dir) {
        if (eligible(tour.steps[i])) return i;
    }
    return -1;
}

// Runs leave/enter hooks, group hooks included, then moves the index
function goTo(next: number) {
    if (!tour) return;
    const prev = index >= 0 ? tour.steps[index] : undefined;
    const target = tour.steps[next];

    safe(prev?.leave, `${prev?.id} leave`);
    if (prev?.group && prev.group !== target.group) safe(tour.groups?.[prev.group]?.leave, `group ${prev.group} leave`);
    if (target.group && target.group !== prev?.group) safe(tour.groups?.[target.group]?.enter, `group ${target.group} enter`);

    index = next;
    ran.add(target.id);
    safe(target.enter, `${target.id} enter`);
    notify();
}

// --- Store ---

export const TourStore = {
    get: snapshot,

    subscribe(fn: Listener): () => void {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },

    start(t: Tour) {
        if (tour) TourStore.end("restart", true);
        tour = t;
        index = -1;
        ran = new Set();
        // Marked on start so a tour never shows twice on its own
        settings.store.toursSeen = { ...settings.store.toursSeen, [t.id]: t.version };

        const first = findStep(-1, 1);
        if (first < 0) {
            tour = null;
            notify();
            return;
        }
        logger.debug(`Tour ${t.id} started`);
        goTo(first);
    },

    next() {
        if (!tour) return;
        const n = findStep(index, 1);
        if (n < 0) TourStore.end("done");
        else goTo(n);
    },

    back() {
        if (!TourStore.canGoBack()) return;
        goTo(findStep(index, -1));
    },

    /** False on the first step and right after an action step. */
    canGoBack(): boolean {
        if (!tour) return false;
        const prev = findStep(index, -1);
        return prev >= 0 && tour.steps[prev].kind !== "action";
    },

    isLast(): boolean {
        return findStep(index, 1) < 0;
    },

    /** 1-based position among the steps that are eligible right now. */
    position(): { pos: number; total: number; } {
        if (!tour) return { pos: 0, total: 0 };
        const list = tour.steps.filter((s, i) => i === index || eligible(s));
        return { pos: list.indexOf(tour.steps[index]) + 1, total: list.length };
    },

    end(reason: TourEndReason, quiet = false) {
        if (!tour) return;
        const step = tour.steps[index];
        safe(step?.leave, `${step?.id} leave`);
        if (step?.group) safe(tour.groups?.[step.group]?.leave, `group ${step.group} leave`);

        logger.debug(`Tour ${tour.id} ended: ${reason}`);
        if (!quiet) {
            endedAt = Date.now();
            endedTour = tour.id;
        }
        tour = null;
        index = -1;
        ran = new Set();
        notify();
    },
};

export function useTourState(): TourSnapshot {
    const [s, setS] = React.useState(snapshot);
    React.useEffect(() => TourStore.subscribe(setS), []);
    return s;
}

// --- Seen state ---

export function shouldAutoStart(t: Tour): boolean {
    // UIState held this before, so a tour seen back then still counts
    const seen = Math.max(settings.store.toursSeen?.[t.id] ?? 0, UIState.get("toursSeen")[t.id] ?? 0);
    return settings.store.showTours && seen < t.version;
}

export function resetToursSeen() {
    settings.store.toursSeen = {};
    UIState.replace("toursSeen", {});
}

// --- Actions ---

// Components register what the tour may do with them (open a menu, switch a section)
const actions = new Map<string, (...args: any[]) => unknown>();

export function useTourAction(name: string, fn: (...args: any[]) => unknown) {
    const ref = React.useRef(fn);
    ref.current = fn;

    React.useEffect(() => {
        const call = (...args: any[]) => ref.current(...args);
        actions.set(name, call);
        return () => {
            if (actions.get(name) === call) actions.delete(name);
        };
    }, [name]);
}

export function runTourAction<T = unknown>(name: string, ...args: any[]): T | undefined {
    const fn = actions.get(name);
    if (!fn) {
        logger.debug(`No tour action "${name}" registered`);
        return undefined;
    }
    try { return fn(...args) as T; } catch (e) {
        logger.error(`Tour action "${name}" failed:`, e);
        return undefined;
    }
}

// --- Signals ---

export function emitTourSignal(name: string) {
    if (!tour) return;
    const step = tour.steps[index];
    if (step.waitFor === name) {
        TourStore.next();
        return;
    }
    if (step.endOn?.includes(name)) {
        TourStore.end("closed");
        showToast({ text: "Tour closed. Replay it from the ? button." });
    }
}
