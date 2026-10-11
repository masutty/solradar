/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Switch } from "@components/Switch";
import { React } from "@webpack/common";

import { COLORS, descriptionText } from "../../ui/styles";
import { HelpTip, TechBadge } from "./Setting";

export type BlockMaster = {
    value: boolean;
    onChange: (value: boolean) => void;
};

function Chevron({ expanded }: { expanded: boolean; }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            style={{ transition: "transform 0.15s", transform: expanded ? "rotate(180deg)" : "none" }}
        >
            <path d="M5.3 9.3a1 1 0 0 1 1.4 0L12 14.6l5.3-5.3a1 1 0 1 1 1.4 1.4l-6 6a1 1 0 0 1-1.4 0l-6-6a1 1 0 0 1 0-1.4Z" />
        </svg>
    );
}

// A foldable section. With a master switch, the body only shows while the feature is on
// (or when `keepBodyVisible` is set, for settings that still apply with the switch off).
// The chevron always sits at the far right, after the switch, so switches line up across blocks.
export function Block({ title, titleExtra, subtitle, tooltip, tech, open, onToggle, master, keepBodyVisible, children }: {
    title: string;
    /** Shown right after the title, e.g. a small marker. */
    titleExtra?: React.ReactNode;
    subtitle?: React.ReactNode;
    tooltip?: string;
    tech?: boolean;
    open: boolean;
    onToggle: () => void;
    master?: BlockMaster;
    keepBodyVisible?: boolean;
    children: React.ReactNode;
}) {
    const enabled = !master || master.value || !!keepBodyVisible;
    const expanded = enabled && open;
    const toggle = enabled ? onToggle : undefined;

    return (
        <div style={{ borderRadius: 8, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                <div
                    role="button"
                    tabIndex={enabled ? 0 : -1}
                    aria-expanded={expanded}
                    onClick={toggle}
                    onKeyDown={e => { if (enabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(); } }}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2, cursor: enabled ? "pointer" : "default" }}
                >
                    <span style={{ color: COLORS.label, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {title}
                        {titleExtra}
                        {tech && <TechBadge />}
                        {tooltip && <HelpTip text={tooltip} />}
                    </span>
                    {subtitle && <span style={descriptionText}>{subtitle}</span>}
                </div>

                {master && <Switch checked={master.value} onChange={master.onChange} />}

                <button
                    type="button"
                    onClick={toggle}
                    disabled={!enabled}
                    tabIndex={-1}
                    aria-hidden="true"
                    style={{
                        display: "grid",
                        placeItems: "center",
                        width: 24,
                        height: 24,
                        flexShrink: 0,
                        padding: 0,
                        border: "none",
                        background: "none",
                        color: COLORS.muted,
                        cursor: enabled ? "pointer" : "default",
                        visibility: enabled ? "visible" : "hidden",
                    }}
                >
                    <Chevron expanded={expanded} />
                </button>
            </div>
            {expanded && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 8px 8px" }}>
                    {children}
                </div>
            )}
        </div>
    );
}
