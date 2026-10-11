/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconComponent } from "@utils/types";

export const SolsRadarIcon: IconComponent = ({ height = 20, width = 20, className, color }) => {

    return (
        <svg
            aria-hidden="true"
            role="img"
            width={width}
            height={height}
            className={className}
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color }}
        >
            <path
                d="M12 11.9996L5.00197 6.33546C4.57285 5.98813 3.93869 6.05182 3.63599 6.5135C3.06678 7.38163 2.62413 8.35389 2.34078 9.41136C0.911364 14.746 4.07719 20.2294 9.41185 21.6588C14.7465 23.0882 20.2299 19.9224 21.6593 14.5877C23.0887 9.25308 19.9229 3.76971 14.5882 2.34029C11.9556 1.63489 9.28684 2.04857 7.0869 3.28972"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
            />
        </svg>
    );
};
