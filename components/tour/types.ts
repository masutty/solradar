/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ReactNode } from "react";

/** A `data-sora-tour` id, or a CSS selector for elements Discord renders (context menu items). */
export type AnchorRef = string | { css: string; fallback?: string; };
export type Placement = "top" | "bottom" | "left" | "right";
export type StepKind = "info" | "demo" | "action";
export type TourEndReason = "done" | "skip" | "closed" | "tab" | "unmount" | "restart";

export interface TourContext {
    /** Whether a step already ran in this tour session. */
    ran(stepId: string): boolean;
}

export interface TourStep {
    id: string;
    kind: StepKind;
    title: string;
    body: ReactNode;
    /** Several refs are measured as one union rect. No anchor means a centered card. */
    anchor?: AnchorRef | AnchorRef[];
    placement?: Placement;
    /** Checked lazily, when the tour moves onto the step. */
    when?(ctx: TourContext): boolean;
    /** Steps in the same group share the group's enter/leave on the tour. */
    group?: string;
    enter?(): void;
    leave?(): void;
    /** Signal that moves to the next step. */
    waitFor?: string;
    /** Action steps: text next to the pulsing dot. */
    hint?: string;
    /** Signals that end the tour while this step is shown. */
    endOn?: string[];
    /** Let clicks reach the highlighted element on a non-action step. */
    holeClickable?: boolean;
    /** Replaces the Next button. Next runs after it only if the step did not change meanwhile. */
    primary?: { label: string; run(): void | Promise<void>; };
    /** Ghost button that acts like Next, shown before the primary. */
    secondaryLabel?: string;
    /** Runs before the ghost button moves on, for example to skip a part of the tour. */
    secondaryRun?(): void;
}

export interface TourGroup {
    enter(): void;
    leave(): void;
}

export interface Tour {
    id: string;
    /** Bump to show the tour again once to everyone. */
    version: number;
    /** Shown uppercase in the card eyebrow and in the replay tooltip. */
    label: string;
    steps: TourStep[];
    groups?: Record<string, TourGroup>;
}
