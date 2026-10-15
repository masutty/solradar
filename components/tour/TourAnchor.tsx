/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";
import type { ReactNode } from "react";

/** Spread on a native element. Passing undefined adds nothing. */
export function tourAnchor(id?: string): { "data-sora-tour"?: string; } {
    return id ? { "data-sora-tour": id } : {};
}

/** Wraps components that don't forward props. display: contents keeps the layout as is. */
export function TourAnchor({ id, children }: { id: string; children: ReactNode; }) {
    return <div data-sora-tour={id} style={{ display: "contents" }}>{children}</div>;
}
