/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./redactable.css";

import { React, Tooltip, useState } from "@webpack/common";

import { settings } from "../../settings";
import { parseCsv } from "../../utils";

/**
 * One item's anonymized state: hidden until clicked, and hidden again the next time it mounts.
 * Pass the snipe's server so the servers that are always anonymized apply to it.
 */
export function useRedaction(guildId?: string) {
    const { anonymizeEverything, anonymizeGuilds } = settings.use(["anonymizeEverything", "anonymizeGuilds"]);
    const [revealed, setRevealed] = useState(false);
    const anonymized = anonymizeEverything || (!!guildId && parseCsv(anonymizeGuilds).has(guildId));
    return {
        hidden: anonymized && !revealed,
        reveal: () => setRevealed(true),
        rehide: anonymized && revealed ? () => setRevealed(false) : undefined,
    };
}

export type Redaction = ReturnType<typeof useRedaction>;

/**
 * A placeholder whose width never depends on what it hides.
 * `jitter` moves it up to that many pixels either way, at random, so a list of them looks less uniform.
 */
export function Bar({ width, round, jitter = 0 }: { width: number; round?: boolean; jitter?: number; }) {
    const [offset] = useState(() => Math.round((Math.random() * 2 - 1) * jitter));
    const size = width + offset;
    return <i className={`vc-sora-redacted-bar${round ? " round" : ""}`} style={{ width: size, height: round ? size : undefined }} />;
}

/** Shows `bars` while hidden. The children, and any tooltip they carry, are only mounted once revealed. */
export function Redactable({ redaction, bars, column, children }: {
    redaction: Redaction;
    bars: React.ReactNode;
    column?: boolean;
    children: React.ReactNode;
}) {
    const { hidden, reveal, rehide } = redaction;
    const click = (action: () => void) => (e: React.SyntheticEvent) => {
        e.preventDefault();
        e.stopPropagation();
        action();
    };

    if (hidden) {
        return (
            <Tooltip text="Could expose where the snipe came from, click to reveal">
                {({ onMouseEnter, onMouseLeave }) => (
                    <span
                        className={`vc-sora-redacted${column ? " column" : ""}`}
                        role="button"
                        tabIndex={0}
                        aria-label="Reveal this snipe"
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        onClick={click(reveal)}
                        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") click(reveal)(e); }}
                    >
                        {bars}
                    </span>
                )}
            </Tooltip>
        );
    }

    return rehide
        ? <span className="vc-sora-revealed" onClick={click(rehide)}>{children}</span>
        : <>{children}</>;
}
