/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export type NoteVariant = "default" | "warning" | "danger" | "positive";

const BASE: React.CSSProperties = {
    fontSize: 12,
    lineHeight: 1.5,
    padding: "8px 12px",
    borderRadius: 6,
    margin: 0,
};

const VARIANT_STYLES: Record<NoteVariant, React.CSSProperties> = {
    default: {
        ...BASE,
        color: "var(--text-muted)",
        background: "var(--background-mod-subtle)",
        border: "1px solid transparent",
    },
    warning: {
        ...BASE,
        color: "var(--status-warning)",
        background: "hsl(38deg 95% 54% / 10%)",
        border: "1px solid hsl(38deg 95% 54% / 25%)",
    },
    danger: {
        ...BASE,
        color: "var(--text-feedback-critical)",
        background: "hsl(359deg 87% 54% / 10%)",
        border: "1px solid hsl(359deg 87% 54% / 25%)",
    },
    positive: {
        ...BASE,
        color: "hsl(140deg 50% 50%)",
        background: "hsl(140deg 50% 50% / 10%)",
        border: "1px solid hsl(140deg 50% 50% / 25%)",
    },
};

export function Note({ variant = "default", children, style }: {
    variant?: NoteVariant;
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return <p style={{ ...VARIANT_STYLES[variant], ...style }}>{children}</p>;
}
