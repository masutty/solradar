/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./tour.css";

import { React, ReactDOM, useEffect, useRef, useState } from "@webpack/common";

import { Logger } from "../../logger";
import { TourStore, useTourState } from "../../stores/TourStore";
import { measureAnchor, Rect, scrollAnchorIntoView } from "./anchors";
import type { Placement, TourStep } from "./types";

const logger = new Logger("SolRadar/Tour");

const ANCHOR_TIMEOUT_MS = 1500;
const RESCROLL_MS = 600;
const HOLE_PAD = 4;
const GAP = 12;
const MARGIN = 12;
const CARD_WIDTH = 320;
const INTERACTIVE = "input, textarea, select, button, a, [contenteditable='true'], [role='button'], [role='slider'], [role='tab'], [role='menuitem'], [role='option']";

// --- Helpers ---

let primaryBusy = false;

async function runPrimary(step: TourStep) {
    if (primaryBusy) return;
    primaryBusy = true;
    try {
        const before = TourStore.get();
        if (step.primary) {
            try { await step.primary.run(); } catch (e) { logger.error(`primary of ${step.id} failed:`, e); }
        }
        // A signal may already have moved the tour, don't skip a second step
        const after = TourStore.get();
        if (after.tour === before.tour && after.index === before.index) TourStore.next();
    } finally {
        primaryBusy = false;
    }
}

function runSecondary(step: TourStep) {
    try { step.secondaryRun?.(); } catch (e) { logger.error(`secondary of ${step.id} failed:`, e); }
    TourStore.next();
}

const stopBubble = (e: React.SyntheticEvent) => e.stopPropagation();

function padded(r: Rect): Rect {
    return { left: r.left - HOLE_PAD, top: r.top - HOLE_PAD, width: r.width + HOLE_PAD * 2, height: r.height + HOLE_PAD * 2 };
}

function placeCard(hole: Rect | null, w: number, h: number, pref: Placement): { left: number; top: number; } {
    const vw = window.innerWidth, vh = window.innerHeight;
    const clampX = (x: number) => Math.min(Math.max(x, MARGIN), vw - w - MARGIN);
    const clampY = (y: number) => Math.min(Math.max(y, MARGIN), vh - h - MARGIN);
    if (!hole) return { left: clampX((vw - w) / 2), top: clampY((vh - h) / 2) };

    const fits: Record<Placement, boolean> = {
        bottom: hole.top + hole.height + GAP + h <= vh - MARGIN,
        top: hole.top - GAP - h >= MARGIN,
        right: hole.left + hole.width + GAP + w <= vw - MARGIN,
        left: hole.left - GAP - w >= MARGIN,
    };
    const order: Record<Placement, Placement[]> = {
        bottom: ["bottom", "top", "right", "left"],
        top: ["top", "bottom", "right", "left"],
        right: ["right", "left", "bottom", "top"],
        left: ["left", "right", "bottom", "top"],
    };
    const side = order[pref].find(p => fits[p]) ?? "bottom";
    const cx = hole.left + hole.width / 2 - w / 2;
    const cy = hole.top + hole.height / 2 - h / 2;

    switch (side) {
        case "bottom": return { left: clampX(cx), top: clampY(hole.top + hole.height + GAP) };
        case "top": return { left: clampX(cx), top: clampY(hole.top - GAP - h) };
        case "right": return { left: clampX(hole.left + hole.width + GAP), top: clampY(cy) };
        case "left": return { left: clampX(hole.left - GAP - w), top: clampY(cy) };
    }
}

// --- Overlay ---

export function TourOverlay() {
    const { tour, index } = useTourState();
    const step = tour?.steps[index];
    const [rect, setRect] = useState<Rect | null>(null);
    const [ready, setReady] = useState(false);
    const [cardH, setCardH] = useState(180);
    const rootRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Closing the main modal ends the tour and its cleanups
    useEffect(() => () => TourStore.end("unmount", true), []);

    // Hide the card before paint so a new step never shows at the old position
    React.useLayoutEffect(() => {
        setReady(false);
    }, [tour, index]);

    // Track the anchor every frame: covers scrolling, modal animations and resizes
    useEffect(() => {
        if (!step) return;
        if (!step.anchor) {
            setRect(null);
            setReady(true);
            return;
        }

        const { anchor } = step;
        const startedAt = performance.now();
        let settled = false;
        let settledAt = 0;
        let last = "";
        let raf = 0;

        const tick = () => {
            const r = measureAnchor(anchor);
            if (r) {
                if (!settled) {
                    settled = true;
                    settledAt = performance.now();
                    setReady(true);
                }
                // A step's enter may grow the anchor a few frames later (a view switch), so keep it in view briefly
                if (performance.now() - settledAt < RESCROLL_MS) scrollAnchorIntoView(anchor);
                const key = `${r.left}|${r.top}|${r.width}|${r.height}`;
                if (key !== last) {
                    last = key;
                    setRect(r);
                }
            } else if (settled) {
                if (last !== "") {
                    last = "";
                    setRect(null);
                }
            } else if (performance.now() - startedAt <= ANCHOR_TIMEOUT_MS) {
                // It may exist but sit outside its scroll area, which measures as nothing
                scrollAnchorIntoView(anchor);
            } else {
                logger.debug(`Anchor for ${step.id} not found, showing the card centered`);
                settled = true;
                setRect(null);
                setReady(true);
            }
            raf = requestAnimationFrame(tick);
        };
        tick();
        return () => cancelAnimationFrame(raf);
    }, [tour, index]);

    // Card height decides placement
    React.useLayoutEffect(() => {
        const h = cardRef.current?.offsetHeight;
        if (h && h !== cardH) setCardH(h);
    });

    // Blocker clicks never reach Discord's outside-click handlers. A click on the dim ends the tour,
    // on click and not on press, so the release can't land on what is under the overlay
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const stop = (e: Event) => {
            const { classList } = e.target as HTMLElement;
            if (!classList?.contains("vc-sora-tour-blocker")) return;
            e.stopPropagation();
            e.preventDefault();
            if (e.type === "click" && !classList.contains("cover")) TourStore.end("skip");
        };
        const types = ["pointerdown", "mousedown", "click", "contextmenu"] as const;
        types.forEach(t => root.addEventListener(t, stop));
        return () => types.forEach(t => root.removeEventListener(t, stop));
    }, [tour]);

    // Capture phase so Esc doesn't also close the modal underneath
    useEffect(() => {
        if (!tour) return;
        const onKey = (e: KeyboardEvent) => {
            const cur = TourStore.get();
            const s = cur.tour?.steps[cur.index];
            if (!s) return;
            const consume = () => { e.preventDefault(); e.stopImmediatePropagation(); };

            if (e.key === "Escape") {
                consume();
                TourStore.end("skip");
                return;
            }
            if (e.repeat) return;
            // Focused controls keep their own Enter and arrow keys
            if ((e.target as HTMLElement | null)?.closest?.(INTERACTIVE)) return;
            if (e.key === "ArrowLeft" && TourStore.canGoBack()) {
                consume();
                TourStore.back();
            } else if ((e.key === "ArrowRight" || e.key === "Enter") && s.kind !== "action") {
                consume();
                // Keys never run a primary, it can change user data
                TourStore.next();
            }
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [tour]);

    if (!tour || !step) return null;

    const hole = rect ? padded(rect) : null;
    const passThrough = step.kind === "action" || step.holeClickable;
    const cardPos = placeCard(hole, CARD_WIDTH, cardH, step.placement ?? "bottom");
    const { pos, total } = TourStore.position();
    const canBack = TourStore.canGoBack();
    const isLast = TourStore.isLast();

    return ReactDOM.createPortal(
        <div ref={rootRef} className="vc-sora-tour">
            {hole ? (
                <>
                    <div
                        className={`vc-sora-tour-hole${step.kind === "action" ? " pulse" : ""}`}
                        style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
                    />
                    <div className="vc-sora-tour-blocker" style={{ left: 0, right: 0, top: 0, height: Math.max(hole.top, 0) }} />
                    <div className="vc-sora-tour-blocker" style={{ left: 0, right: 0, top: hole.top + hole.height, bottom: 0 }} />
                    <div className="vc-sora-tour-blocker" style={{ left: 0, top: hole.top, width: Math.max(hole.left, 0), height: hole.height }} />
                    <div className="vc-sora-tour-blocker" style={{ left: hole.left + hole.width, right: 0, top: hole.top, height: hole.height }} />
                    {!passThrough && (
                        <div className="vc-sora-tour-blocker cover" style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }} />
                    )}
                </>
            ) : (
                <div className="vc-sora-tour-blocker vc-sora-tour-dim" style={{ inset: 0 }} />
            )}

            <div
                ref={cardRef}
                className="vc-sora-tour-card"
                role="dialog"
                aria-label="Guided tour"
                style={{ left: cardPos.left, top: cardPos.top, width: CARD_WIDTH, opacity: ready ? 1 : 0, pointerEvents: ready ? "auto" : "none" }}
                onClick={stopBubble}
                onMouseDown={stopBubble}
                onPointerDown={stopBubble}
                onContextMenu={stopBubble}
            >
                <div className="vc-sora-tour-head">
                    <span className="vc-sora-tour-eyebrow">{tour.label}</span>
                    <button type="button" className="vc-sora-tour-x" onClick={() => TourStore.end("skip")}>Skip tutorial</button>
                </div>
                <div className="vc-sora-tour-title">{step.title}</div>
                <div className="vc-sora-tour-body">{step.body}</div>
                <div className="vc-sora-tour-foot">
                    <span className="vc-sora-tour-count"><b>{pos}</b> / {total}</span>
                    {step.kind === "action" && <span className="vc-sora-tour-hint"><i />{step.hint}</span>}
                    {canBack && <button type="button" className="vc-sora-tour-btn ghost" onClick={() => TourStore.back()}>Back</button>}
                    {step.kind !== "action" && step.secondaryLabel && (
                        <button type="button" className="vc-sora-tour-btn ghost" onClick={() => runSecondary(step)}>{step.secondaryLabel}</button>
                    )}
                    {step.kind !== "action" && (
                        <button type="button" className="vc-sora-tour-btn primary" onClick={() => runPrimary(step)}>
                            {step.primary?.label ?? (isLast ? "Done" : "Next")}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
