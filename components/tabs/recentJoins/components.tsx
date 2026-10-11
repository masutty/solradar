/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/scrollbar.css";

import { React, useState } from "@webpack/common";

import { Logger } from "../../../logger";
import { SnipeEntry, TAG_CONFIGS } from "../../../stores/SnipeStore";
import { SnipeTag } from "../../../types";
import { Pill, PillVariant } from "../../ui/Pill";
import { COLORS } from "../../ui/styles";

const logger = new Logger("SolRadar.RecentJoins.components");

export const AVATAR_FALLBACK = "https://discord.com/assets/881ed827548f38c6.svg";

export const SUCCESS_TAGS = new Set<SnipeTag>(["link-verified-safe", "biome-verified-real"]);
export const DANGER_TAGS = new Set<SnipeTag>(["link-verified-unsafe", "biome-verified-bait", "failed"]);
export const WARN_TAGS = new Set<SnipeTag>(["biome-verified-timeout", "link-not-verified", "biome-not-verified"]);

export interface SnipeStatus {
    label: string;
    color: string;
    /** Nothing really happened (not joined, ignored, not verified). Shown faded. */
    quiet?: boolean;
}

// One word per snipe, picked from its tags in this order
const STATUS_ORDER: [SnipeTag, SnipeStatus][] = [
    ["failed", { label: "Failed", color: COLORS.danger }],
    ["biome-verified-bait", { label: "Bait", color: COLORS.danger }],
    ["link-verified-unsafe", { label: "Unsafe link", color: COLORS.danger }],
    ["biome-verified-real", { label: "Real", color: COLORS.positive }],
    ["biome-verified-timeout", { label: "Timed out", color: COLORS.warning }],
    ["redundant-biome-ignored", { label: "Ignored", color: COLORS.muted, quiet: true }],
    ["link-ignored", { label: "Ignored", color: COLORS.muted, quiet: true }],
    ["biome-not-verified", { label: "Not verified", color: COLORS.muted, quiet: true }],
];

export function getSnipeStatus(entry: SnipeEntry): SnipeStatus {
    const fromTags = STATUS_ORDER.find(([tag]) => entry.tags.includes(tag))?.[1];
    if (fromTags) return fromTags;
    // Metrics are only recorded when a join actually happened
    return entry.metrics ? { label: "Joined", color: COLORS.muted } : { label: "Not joined", color: COLORS.muted, quiet: true };
}

export function formatClock(ts: number, withSeconds = false): string {
    const d = new Date(ts);
    const parts = [d.getHours(), d.getMinutes(), ...(withSeconds ? [d.getSeconds()] : [])];
    return parts.map(n => String(n).padStart(2, "0")).join(":");
}

/** Maps a SnipeTag to a PillVariant. */
export function tagToPillVariant(tag: SnipeTag): PillVariant {
    if (SUCCESS_TAGS.has(tag)) return "green";
    if (DANGER_TAGS.has(tag)) return "red";
    if (WARN_TAGS.has(tag)) return "yellow";
    return "muted";
}

export function TagBadge({ tag }: { tag?: SnipeTag; }) {
    if (!tag || !TAG_CONFIGS[tag]) {
        logger.warn("TagBadge received invalid tag:", tag);
        return null;
    }
    const config = TAG_CONFIGS[tag];

    return (
        <Pill
            variant={tagToPillVariant(tag)}
            size="small"
            radius="xs"
            border="subtle"
            emoji={config.emoji}
            title={config.detail}
        >
            {config.label}
        </Pill>
    );
}

export function FallbackImage({ src, style }: { src?: string; style?: React.CSSProperties; }) {
    const [imgSrc, setImgSrc] = useState(src || AVATAR_FALLBACK);
    React.useEffect(() => setImgSrc(src || AVATAR_FALLBACK), [src]);
    return <img src={imgSrc} alt="" onError={() => setImgSrc(AVATAR_FALLBACK)} style={style} />;
}

export function formatTimeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function MessageTextarea({ value }: { value: string; }) {
    return (
        <textarea
            className="vc-sora-thin-scroll"
            readOnly
            value={value}
            style={{
                width: "100%",
                resize: "vertical",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--background-mod-subtle)",
                background: "var(--background-tertiary)",
                color: "var(--text-default)",
                fontSize: 13,
                fontFamily: "var(--font-code)",
                lineHeight: 1.5,
                minHeight: 60,
                boxSizing: "border-box",
                outline: "none",
                scrollbarWidth: "thin",
            }}
        />
    );
}
