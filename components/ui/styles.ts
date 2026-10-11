/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { CSSProperties } from "react";

// Shared look for every tab, so they all match the Settings tab.
// Text always uses Discord's own font; only versions and IDs use var(--font-code).

export const COLORS = {
    positive: "var(--status-positive)",
    danger: "var(--status-danger)",
    warning: "var(--status-warning)",
    brand: "var(--text-brand)",
    text: "var(--text-default)",
    label: "var(--control-secondary-text-default)",
    muted: "var(--text-muted)",
};

export const sectionTitle: CSSProperties = {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "12px 0 0",
};

export const card: CSSProperties = {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
};

export const rowCard: CSSProperties = {
    ...card,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
};

export const labelText: CSSProperties = {
    color: COLORS.label,
    fontSize: 14,
    fontWeight: 500,
};

export const descriptionText: CSSProperties = {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 1.4,
};

export const tabColumn: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 20,
};
