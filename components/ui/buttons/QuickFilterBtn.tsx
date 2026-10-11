/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Pill, type PillProps } from "../Pill";

export interface QuickFilterBtnProps
    extends Omit<PillProps, "children"> {
    label: string;
    active: boolean;
    onClick: () => void;
}

export function QuickFilterBtn({
    label,
    active,
    onClick,
    variant,
    size = "small",
    border,
    ...rest
}: QuickFilterBtnProps) {
    return (
        <button
            onClick={onClick}
            style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
            }}
        >
            <Pill
                {...rest}
                variant={active ? variant : "muted"}
                size={size}
                border={active ? (border ?? "subtle") : "none"}
            >
                {label}
            </Pill>
        </button>
    );
}
