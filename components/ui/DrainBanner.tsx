/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, Tooltip } from "@webpack/common";

export interface DrainBannerProps {
    /** A CSS color, used for the icon and the tinted background */
    accent: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    /** What is shown on the right, like "2:22" or "Until biome ends" */
    time: string;
    /** 0 to 1. The tinted fill shrinks with it. */
    fraction: number;
    onClick: () => void;
    style?: React.CSSProperties;
    className?: string;
}

/** A banner whose tinted background is the time left. Clicking anywhere on it cancels. Sized like a trigger card. */
export function DrainBanner({ accent, icon, title, subtitle, time, fraction, onClick, style, className }: DrainBannerProps) {
    return (
        <Tooltip text="Click to cancel">
            {props => (
                <div
                    {...props}
                    role="button"
                    className={className}
                    onClick={onClick}
                    style={{
                        position: "relative",
                        overflow: "hidden",
                        width: "100%",
                        boxSizing: "border-box",
                        flexShrink: 0,
                        borderRadius: 8,
                        cursor: "pointer",
                        userSelect: "none",
                        background: `color-mix(in srgb, ${accent} 7%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 28%, transparent)`,
                        ...style,
                    }}
                >
                    <div style={{
                        position: "absolute",
                        inset: "0 auto 0 0",
                        width: `${Math.min(1, Math.max(0, fraction)) * 100}%`,
                        background: `color-mix(in srgb, ${accent} 17%, transparent)`,
                        transition: "width 0.25s linear",
                    }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", minHeight: 60, boxSizing: "border-box" }}>
                        <span style={{ color: accent, display: "grid", placeItems: "center", width: 40, flexShrink: 0 }}>{icon}</span>
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-default)" }}>{title}</div>
                            <div style={{
                                fontSize: 12.5,
                                color: "var(--text-muted)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}>
                                {subtitle}
                            </div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-default)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                            {time}
                        </span>
                    </div>
                </div>
            )}
        </Tooltip>
    );
}
