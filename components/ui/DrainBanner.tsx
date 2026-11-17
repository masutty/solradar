/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./drainBanner.css";

import { React, Tooltip } from "@webpack/common";

export interface DrainBannerProps {
    /** A CSS color, used for the icon tile, the tinted background and the time */
    accent: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    /** What is shown on the right, like "2:22" or "Until biome ends" */
    time: string;
    /** Replaces the time on hover, like "Release" or "Cancel" */
    action: string;
    /** Multi-line text for the tooltip */
    tooltip: string;
    /** 0 to 1. The tinted fill shrinks with it. */
    fraction: number;
    /** No countdown: the fill stays full and a soft band sweeps across it */
    openEnded?: boolean;
    onClick: () => void;
    style?: React.CSSProperties;
    className?: string;
}

/** A banner whose tinted background is the time left. Clicking anywhere on it runs the action. Sized like a trigger card. */
export function DrainBanner({ accent, icon, title, subtitle, time, action, tooltip, fraction, openEnded, onClick, style, className }: DrainBannerProps) {
    const width = openEnded ? 1 : Math.min(1, Math.max(0, fraction));

    return (
        <Tooltip text={<div className="vc-sora-drain-tip">{tooltip}</div>}>
            {props => (
                <div
                    {...props}
                    role="button"
                    className={`vc-sora-drain${openEnded ? " open" : ""}${className ? ` ${className}` : ""}`}
                    onClick={onClick}
                    style={{ "--vc-sora-drain-c": accent, ...style } as React.CSSProperties}
                >
                    <span className="vc-sora-drain-fill" style={{ width: `${width * 100}%` }} />
                    <span className="vc-sora-drain-tile">{icon}</span>
                    <div className="vc-sora-drain-text">
                        <div className="vc-sora-drain-title">{title}</div>
                        <div className="vc-sora-drain-sub">{subtitle}</div>
                    </div>
                    <span className="vc-sora-drain-end">
                        <span className="vc-sora-drain-time">{time}</span>
                        <span className="vc-sora-drain-action">{action}</span>
                    </span>
                </div>
            )}
        </Tooltip>
    );
}
