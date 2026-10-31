/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Join speed (test build): every phase of one join, from the Discord message to the game server.
// The Roblox part is read from Roblox's own log.

import { Button } from "@components/Button";
import { React, Tooltip } from "@webpack/common";

import { captureRobloxTimeline, isTimelineComplete, PHASES, phasesOf } from "../../../services/JoinTimeline";
import { SnipeEntry } from "../../../stores/SnipeStore";
import { COLORS, sectionTitle } from "../../ui/styles";

const cell: React.CSSProperties = {
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
    display: "flex",
    flexDirection: "column",
    gap: 1,
    padding: "8px 10px",
};

const ms = (n: number) => `${Math.round(n)}ms`;

export function JoinSpeed({ entry }: { entry: SnipeEntry; }) {
    const m = entry.metrics;
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const read = async (force: boolean) => {
        setBusy(true);
        setError(null);
        try {
            const t = await captureRobloxTimeline(entry.id, force);
            if (!t) setError("Roblox's log has nothing for this launch. Logs may be gone, or Roblox did not get the link.");
        } catch (e) {
            setError(String(e));
        } finally {
            setBusy(false);
        }
    };

    // Fill in missing data on open, once the join had time to finish
    React.useEffect(() => {
        if (m?.launchedAt && !isTimelineComplete(entry.robloxTimeline) && Date.now() - m.launchedAt > 5_000) void read(false);
    }, [entry.id]);

    if (!m?.launchedAt) {
        return (
            <>
                <p style={sectionTitle}>Join speed</p>
                <span style={{ fontSize: 12.5, color: COLORS.muted }}>Only snipes made with the join-speed build have these numbers.</span>
            </>
        );
    }

    const phases = phasesOf(entry);
    const t = entry.robloxTimeline;
    const badges = [
        m.launchMethod && `launch: ${m.launchMethod}`,
        t && `roblox: ${t.mode === "warm" ? "home page (warm)" : "cold start"}`,
        t?.forwarderMs != null && `helper process: ${t.forwarderMs}ms`,
        m.discordAwake && "Discord kept awake",
        m.discordFocused === false && "Discord unfocused",
    ].filter(Boolean) as string[];

    return (
        <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
                <span style={{ ...sectionTitle, margin: 0 }}>Join speed</span>
                <Button size="small" variant="secondary" disabled={busy} onClick={() => read(true)}>
                    {busy ? "Reading…" : "Read Roblox log"}
                </Button>
            </div>

            {badges.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {badges.map(b => (
                        <span key={b} style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 999, color: COLORS.label, background: "var(--background-mod-strong)" }}>{b}</span>
                    ))}
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 6 }}>
                {PHASES.map(p => {
                    const v = phases[p.key];
                    const headline = p.key === "toServer";
                    return (
                        <Tooltip key={p.key} text={p.tip}>
                            {props => (
                                <div {...props} style={{ ...cell, ...(headline && { boxShadow: `inset 0 0 0 1px ${COLORS.brand}` }) }}>
                                    <span style={{ fontSize: 15, fontWeight: 600, color: v === undefined ? COLORS.muted : COLORS.text, fontVariantNumeric: "tabular-nums" }}>
                                        {v === undefined ? "-" : ms(v)}
                                    </span>
                                    <span style={{ fontSize: 11, color: COLORS.muted }}>{p.label}</span>
                                </div>
                            )}
                        </Tooltip>
                    );
                })}
            </div>

            {m.launchFallback && (
                <span style={{ fontSize: 12.5, color: COLORS.warning }}>Direct launch fell back to the shell: {m.launchFallback}</span>
            )}
            {t?.slowHttp.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 12.5, color: COLORS.warning }}>Slow Roblox requests during this join:</span>
                    {t.slowHttp.map(h => (
                        <span key={`${h.at}-${h.url}`} style={{ fontSize: 12, color: COLORS.muted, fontFamily: "var(--font-code)", overflowWrap: "anywhere" }}>
                            {ms(h.ms)} {h.url}
                        </span>
                    ))}
                </div>
            ) : null}
            {error && <span style={{ fontSize: 12.5, color: COLORS.muted }}>{error}</span>}
        </>
    );
}
