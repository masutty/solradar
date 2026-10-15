/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AnchorRef } from "./types";

export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export const FORCED_HOVER_CLASS = "vc-sora-tour-hover";

function query(selector: string): HTMLElement | null {
    try { return document.querySelector<HTMLElement>(selector); } catch { return null; }
}

function byId(id: string): HTMLElement | null {
    return query(`[data-sora-tour="${id}"]`);
}

function resolve(ref: AnchorRef): HTMLElement | null {
    if (typeof ref === "string") return byId(ref);
    return query(ref.css) ?? (ref.fallback ? byId(ref.fallback) : null);
}

function list(anchor: AnchorRef | AnchorRef[]): AnchorRef[] {
    return Array.isArray(anchor) ? anchor : [anchor];
}

// A TourAnchor wrapper is display: contents and has no box, so use its children
function boxElements(el: HTMLElement): HTMLElement[] {
    if (getComputedStyle(el).display !== "contents") return [el];
    return Array.from(el.children).flatMap(c => boxElements(c as HTMLElement));
}

// Cut the box to what its scroll containers show, so the hole never spills past a modal
function visibleBox(el: HTMLElement): { left: number; top: number; right: number; bottom: number; } | null {
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const c = p.getBoundingClientRect();
        left = Math.max(left, c.left);
        top = Math.max(top, c.top);
        right = Math.min(right, c.right);
        bottom = Math.min(bottom, c.bottom);
    }
    return right > left && bottom > top ? { left, top, right, bottom } : null;
}

export function measureAnchor(anchor: AnchorRef | AnchorRef[]): Rect | null {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const ref of list(anchor)) {
        const el = resolve(ref);
        if (!el) continue;
        for (const box of boxElements(el)) {
            const q = visibleBox(box);
            if (!q) continue;
            l = Math.min(l, q.left);
            t = Math.min(t, q.top);
            r = Math.max(r, q.right);
            b = Math.max(b, q.bottom);
        }
    }
    if (l === Infinity) return null;
    return { left: Math.round(l), top: Math.round(t), width: Math.round(r - l), height: Math.round(b - t) };
}

// Bring the last box in, then the first, so the whole anchor shows, or at least its top when it is too tall
export function scrollAnchorIntoView(anchor: AnchorRef | AnchorRef[]) {
    const boxes = list(anchor).flatMap(ref => {
        const el = resolve(ref);
        return el ? boxElements(el) : [];
    });
    if (!boxes.length) return;
    boxes[boxes.length - 1].scrollIntoView({ block: "nearest", inline: "nearest" });
    boxes[0].scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** Adds or removes the class that copies the element's :hover look. */
export function setForcedHover(ref: AnchorRef, on: boolean) {
    const el = resolve(ref);
    if (!el) return;
    for (const box of boxElements(el)) box.classList.toggle(FORCED_HOVER_CLASS, on);
}

export function clearForcedHover() {
    document.querySelectorAll(`.${FORCED_HOVER_CLASS}`).forEach(el => el.classList.remove(FORCED_HOVER_CLASS));
}

/** Enough of a mouse event for ContextMenuApi.openContextMenu, placed under the element. */
export function fakeMouseEvent(el: HTMLElement): React.MouseEvent {
    const r = el.getBoundingClientRect();
    const x = r.left, y = r.bottom;
    return {
        pageX: x, pageY: y, clientX: x, clientY: y, screenX: x, screenY: y,
        button: 0,
        target: el,
        currentTarget: el,
        nativeEvent: new MouseEvent("click", { clientX: x, clientY: y }),
        preventDefault() { },
        stopPropagation() { },
        isDefaultPrevented: () => false,
        isPropagationStopped: () => false,
    } as unknown as React.MouseEvent;
}
