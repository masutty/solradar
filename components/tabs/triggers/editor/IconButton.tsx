/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, Tooltip } from "@webpack/common";

export function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
    );
}

// Square footer button for the trigger and folder editors
export function IconButton({ tooltip, danger, onClick, children }: { tooltip: string; danger?: boolean; onClick: () => void; children: React.ReactNode; }) {
    return (
        <Tooltip text={tooltip}>
            {props => (
                <Button {...props} size="small" variant={danger ? "dangerSecondary" : "secondary"} style={{ minWidth: 30, width: 30, padding: 0 }} aria-label={tooltip} onClick={onClick}>
                    {children}
                </Button>
            )}
        </Tooltip>
    );
}
