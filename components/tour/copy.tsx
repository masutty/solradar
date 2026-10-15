/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";
import type { ReactNode } from "react";

import { OutcomeGlyph } from "../tabs/recentJoins/SnipeTimeline";
import type { OutcomeIcon } from "../tabs/recentJoins/steps";

// Building blocks for tour copy. They copy the real UI elements, so a step shows what the user will see.

export const P = ({ children }: { children: ReactNode; }) => <p>{children}</p>;

export const Muted = ({ children }: { children: ReactNode; }) => <p className="vc-sora-tour-muted">{children}</p>;

/** Rows of "element, then what it means". */
export const Legend = ({ children }: { children: ReactNode; }) => <div className="vc-sora-tour-legend">{children}</div>;

export const Row = ({ el, children }: { el: ReactNode; children: ReactNode; }) => (
    <>
        <span className="vc-sora-tour-legend-el">{el}</span>
        <span>{children}</span>
    </>
);

/** Colored text, for the name of a control or a state. */
export const Tint = ({ color, children }: { color: string; children: ReactNode; }) =>
    <b style={{ color }}>{children}</b>;

export const Rainbow = ({ children }: { children: ReactNode; }) => <span className="vc-sora-tour-rainbow">{children}</span>;

/** Spell-checker squiggle. */
export const Wavy = ({ children }: { children: ReactNode; }) => <span className="vc-sora-tour-wavy">{children}</span>;

/** A small copy of a Discord button. */
export const Btn = ({ kind = "brand", children }: { kind?: "brand" | "positive" | "secondary"; children: ReactNode; }) =>
    <span className={`vc-sora-tour-btnchip ${kind}`}>{children}</span>;

/** The result badge from a snipe card's icon. */
export const ResultBadge = ({ icon, color }: { icon: OutcomeIcon; color: string; }) => (
    <span className="vc-sora-tour-badge" style={{ background: color }}>
        <OutcomeGlyph icon={icon} size={10} />
    </span>
);

/** The status pill from the snipe details header. */
export const StatusPill = ({ label, color }: { label: string; color: string; }) => (
    <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
        {label}
    </span>
);

/** A trigger card quick toggle, switched on. */
export const QuickToggle = ({ emoji, color }: { emoji: string; color: string; }) => (
    <span className="vc-sora-trigger-qt on" style={{ "--sora-c": color } as React.CSSProperties}>
        <span className="emoji">{emoji}</span>
    </span>
);

/** A trigger card priority badge. */
export const Priority = ({ lock, value }: { lock?: boolean; value: number; }) =>
    <span className="vc-sora-trigger-prio">{lock ? "🔒" : "★"} {value}</span>;

export const DisabledTag = () => <span className="vc-sora-trigger-offtag">Disabled</span>;

/** The editor's "this section is set up" dot. */
export const SetUpDot = () => <span className="vc-sora-editor-dot" style={{ display: "inline-block", margin: "0 2px", verticalAlign: 1 }} />;
