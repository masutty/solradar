/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";

/** A small "?" that shows text on hover. */
export function HelpTip({ text }: { text: string; }) {
    return (
        <Tooltip text={text}>
            {props => (
                <span {...props} style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: "var(--background-mod-strong)",
                    color: "var(--text-muted)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "help",
                    flexShrink: 0,
                    userSelect: "none",
                }}>?</span>
            )}
        </Tooltip>
    );
}
