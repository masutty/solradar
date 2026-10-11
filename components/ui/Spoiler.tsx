/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip, useState } from "@webpack/common";
import { ReactNode } from "react";

export default function Spoiler({
    className,
    style,
    placeholder,
    children
}: {
    className?: string;
    style?: React.CSSProperties;
    placeholder?: ReactNode;
    children: ReactNode;
}) {
    const [revealed, setRevealed] = useState(false);
    const [blocks] = useState(() =>
        "█".repeat(Math.floor(Math.random() * 9) + 6)
    );

    if (revealed) {
        return (
            <span
                style={{ cursor: "pointer", ...style }}
                onClick={e => {
                    e.stopPropagation();
                    setRevealed(false);
                }}
            >
                {children}
            </span>
        );
    }

    return (
        <Tooltip text="This information could expose the origin of the snipe. Click to reveal.">
            {({ onMouseEnter, onMouseLeave }) => (
                <span
                    onClick={e => { e.stopPropagation(); setRevealed(true); }}
                    onMouseEnter={onMouseEnter}
                    onMouseLeave={onMouseLeave}
                    style={{
                        cursor: "pointer",
                        userSelect: "none",
                        opacity: 0.75,
                        ...style
                    }}
                >
                    {placeholder ?? blocks}
                </span>
            )}
        </Tooltip>
    );
}
