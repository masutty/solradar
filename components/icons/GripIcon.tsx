/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconComponent } from "@utils/types";

// Standard 6-dot grip (3 rows x 2 cols) for dragging triggers.
export const GripIcon: IconComponent = ({ height = 16, width = 16, className, color }) => {
    return (
        <svg
            aria-hidden="true"
            role="img"
            width={width}
            height={height}
            className={className}
            viewBox="0 0 16 16"
            fill="currentColor"
            style={{ color }}
        >
            <circle cx="5" cy="3" r="1.3" />
            <circle cx="11" cy="3" r="1.3" />
            <circle cx="5" cy="8" r="1.3" />
            <circle cx="11" cy="8" r="1.3" />
            <circle cx="5" cy="13" r="1.3" />
            <circle cx="11" cy="13" r="1.3" />
        </svg>
    );
};
