/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const svgProps = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
} as const;

export function LockIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} {...svgProps}>
            <rect x="4" y="11" width="16" height="10" rx="2.5" />
            <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
        </svg>
    );
}

export function TimerIcon({ size = 18 }: { size?: number; }) {
    return (
        <svg width={size} height={size} {...svgProps}>
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2M9.5 2.5h5" />
        </svg>
    );
}
