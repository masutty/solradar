/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./Pill.css";

import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { React } from "@webpack/common";

const cl = classNameFactory("vc-sora-pill-");

export type PillVariant =
    | "green"
    | "red"
    | "yellow"
    | "blue"
    | "purple"
    | "pink"
    | "brand"
    | "muted";

export type PillSize = "xs" | "small" | "medium" | "min";

/** none = no border | subtle = 30% opacity | strong = solid */
export type PillBorder = "none" | "subtle" | "strong";

/** full = pill shape, smaller values round the corners less */
export type PillRadius = "full" | "lg" | "md" | "sm" | "xs" | "none";

export interface PillProps {
    variant?: PillVariant;
    size?: PillSize;
    border?: PillBorder;
    radius?: PillRadius;
    /** Shown before the children. With iconOnly, it is the only content. */
    emoji?: string;
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
    title?: string;
    iconOnly?: boolean;
}

export function Pill({
    variant = "muted",
    size = "medium",
    border = "none",
    radius = "full",
    emoji,
    children,
    style,
    className,
    title,
    iconOnly,
}: PillProps) {
    return (
        <span
            title={title}
            style={style}
            className={classes(
                cl("base", variant, size, `border-${border}`, `radius-${radius}`),
                className
            )}
        >
            {emoji && <span>{emoji}</span>}
            {!iconOnly && children}
        </span>
    );
}
