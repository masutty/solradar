/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Timing: how long the join took, from the Discord message to a spot in the server.
// Summary (number, bar, three totals, one note) or Steps (one row per step, DevTools style).

import { Button } from "@components/Button";
import { React, Tooltip } from "@webpack/common";

import { captureRobloxTimeline, isTimelineComplete, JOIN_STEPS, JoinBreakdown, joinBreakdown, STEP_CATS, StepCat } from "../../../services/JoinTimeline";
import { SnipeEntry } from "../../../stores/SnipeStore";
import { formatElapsedTime } from "../../../utils";
import { COLORS, sectionTitle } from "../../ui/styles";
import { formatSecs } from "./SnipeTimeline";
import { phaseSpans } from "./steps";

type View = "summary" | "steps";
const CATS: StepCat[] = ["plugin", "hw", "net"];

function InfoIcon({ warn }: { warn?: boolean; }) {
    return warn
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17v.01" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>;
}

function DocIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
}

function noteFor(entry: SnipeEntry, b: JoinBreakdown, reading: boolean): { text: string; warn?: boolean; action?: boolean; } {
    switch (b.situation) {
        case "cold":
            return entry.metrics?.joinMode === "safe"
                ? { text: "Roblox had to load from closed. Unsafe join mode with Roblox open on the home page skips about 3s.", warn: true }
                : { text: "Roblox was closed, so it had to load first. Keep it open on the home page to skip about 3s.", warn: true };
        case "warm": {
            const top = CATS.reduce((a, k) => b.totals[k] > b.totals[a] ? k : a, "plugin" as StepCat);
            if (top === "hw") return { text: "Most of this time is Roblox starting on your PC, not Sol Radar." };
            if (top === "net") return { text: "Most of this time is Roblox's servers, not your PC or Sol Radar." };
            return { text: "Most of this time is Sol Radar. Open Steps to see which part." };
        }
        case "noSpot": {
            const ask = b.steps.find(s => s.key === "server");
            return ask
                ? { text: `Roblox asked for a spot at ${formatSecs(ask.start)} and didn't get one. The server was probably full.`, warn: true }
                : { text: "Roblox got the link but stopped before asking for a spot.", warn: true };
        }
        case "pending":
            return { text: reading ? "Reading Roblox's log…" : "Roblox's log is read about 30s after the join." };
        case "noLog":
            return { text: "Roblox's log for this join wasn't found, so only Sol Radar's part is shown.", action: true };
        case "old":
            return { text: "Snipes from before this version only have Sol Radar's part." };
    }
}

function Summary({ entry, b, reading, onRead, hover, setHover }: {
    entry: SnipeEntry; b: JoinBreakdown; reading: boolean; onRead: () => void;
    hover: StepCat | null; setHover: (c: StepCat | null) => void;
}) {
    const joined = b.spot !== null;
    const hasRoblox = b.totals.hw > 0 || b.totals.net > 0;
    const open = b.steps.find(s => s.end === null);
    const parts = CATS.filter(k => b.totals[k] > 0);
    const barTotal = parts.reduce((a, k) => a + b.totals[k], 0);
    const note = noteFor(entry, b, reading);
    const dim = (k: StepCat): React.CSSProperties => ({ opacity: hover && hover !== k ? 0.35 : 1 });

    return (
        <div className="vc-sora-tm-card">
            <div className="vc-sora-tm-headline">
                {joined
                    ? <><span className="vc-sora-tm-big">{formatSecs(b.spot!)}</span><span>to a spot in the server</span></>
                    : b.situation === "noSpot"
                        ? <><span className="vc-sora-tm-big warn">No spot</span><span>Roblox didn't get into the server</span></>
                        : <><span className="vc-sora-tm-big">{formatSecs(b.totals.plugin)}</span><span>reaction, Sol Radar's part only</span></>}
            </div>

            {hasRoblox && (
                <div className="vc-sora-tm-bar">
                    {parts.map(k => (
                        <Tooltip key={k} text={`${STEP_CATS[k].name}: ${formatSecs(b.totals[k])}. ${STEP_CATS[k].tip}`}>
                            {props => (
                                <i
                                    {...props}
                                    onMouseEnter={() => { props.onMouseEnter?.(); setHover(k); }}
                                    onMouseLeave={() => { props.onMouseLeave?.(); setHover(null); }}
                                    style={{ flex: `${Math.max(b.totals[k], barTotal * 0.01)} 0 0`, background: STEP_CATS[k].color, ...dim(k) }}
                                />
                            )}
                        </Tooltip>
                    ))}
                    {open && <i className="open" style={{ flex: `${barTotal * 0.25} 0 0` }} />}
                </div>
            )}

            <div className="vc-sora-tm-tiles">
                {CATS.map(k => {
                    const has = b.totals[k] > 0 || k === "plugin";
                    return (
                        <Tooltip key={k} text={STEP_CATS[k].tip}>
                            {props => (
                                <div
                                    {...props}
                                    className="vc-sora-tm-tile"
                                    onMouseEnter={() => { props.onMouseEnter?.(); setHover(k); }}
                                    onMouseLeave={() => { props.onMouseLeave?.(); setHover(null); }}
                                    style={dim(k)}
                                >
                                    <span className="vc-sora-tm-tile-k"><i style={{ background: STEP_CATS[k].color }} />{STEP_CATS[k].name}{k === "plugin" ? " ⚡" : ""}</span>
                                    <span className={`vc-sora-tm-tile-v${has ? "" : " none"}`}>{has ? formatSecs(b.totals[k]) : "–"}</span>
                                </div>
                            )}
                        </Tooltip>
                    );
                })}
            </div>

            <div className={`vc-sora-tm-note${note.warn ? " warn" : ""}`}>
                <InfoIcon warn={note.warn} />
                <span>{note.text}</span>
                {note.action && (
                    <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <Button size="small" variant="secondary" disabled={reading} onClick={onRead}>Read Roblox log</Button>
                    </span>
                )}
            </div>
        </div>
    );
}

const tickStep = (dom: number) => dom <= 60 ? 10 : dom <= 600 ? 100 : dom <= 3000 ? 500 : 1000;
const tickLabel = (t: number) => t === 0 ? "0" : t < 1000 ? `${t}ms` : `${t / 1000}s`;

function Steps({ b }: { b: JoinBreakdown; }) {
    const last = Math.max(...b.steps.map(s => s.end ?? s.start));
    const open = b.steps.some(s => s.end === null);
    const span = (b.spot ?? last) * (open ? 1.25 : 1);
    const step = tickStep(span);
    const dom = Math.max(step, Math.ceil((span * 1.04) / step) * step);
    const pct = (t: number) => `${Math.min(100, (t / dom) * 100)}%`;
    const ticks: number[] = [];
    for (let t = 0; t < dom; t += step) ticks.push(t);
    const labelEvery = ticks.length > 6 ? 2 : 1;

    const grid = (
        <>
            {ticks.slice(1).map(t => <i key={t} className="vc-sora-tm-grid" style={{ left: pct(t) }} />)}
            {b.spot !== null && <i className="vc-sora-tm-spot" style={{ left: pct(b.spot) }} />}
        </>
    );

    return (
        <div className="vc-sora-tm-card steps">
            <div className="vc-sora-tm-row ruler">
                <span />
                <div className="vc-sora-tm-lane">
                    {ticks.filter((_, i) => i % labelEvery === 0).map((t, i) => <span key={t} className={i ? "" : "first"} style={{ left: pct(t) }}>{tickLabel(t)}</span>)}
                </div>
                <span />
            </div>
            {b.steps.map(s => {
                const info = JOIN_STEPS[s.key];
                const dur = s.end === null ? null : s.end - s.start;
                return (
                    <Tooltip key={s.key} text={info.tip}>
                        {props => (
                            <div {...props} className="vc-sora-tm-row">
                                <span className="vc-sora-tm-name">{info.name}</span>
                                <div className="vc-sora-tm-lane">
                                    {grid}
                                    <i
                                        className={`vc-sora-tm-span${dur === null ? " open" : ""}`}
                                        style={{
                                            left: pct(s.start),
                                            width: dur === null ? `calc(100% - ${pct(s.start)})` : pct(dur),
                                            background: dur === null ? undefined : STEP_CATS[info.cat].color,
                                            opacity: s.key === "connect" ? 0.5 : 1,
                                        }}
                                    />
                                </div>
                                <span className={`vc-sora-tm-dur${dur === null ? " warn" : ""}`}>{dur === null ? "no reply" : formatSecs(dur)}</span>
                            </div>
                        )}
                    </Tooltip>
                );
            })}
            <div className="vc-sora-tm-key">
                {CATS.filter(k => b.totals[k] > 0).map(k => <span key={k}><i style={{ background: STEP_CATS[k].color }} />{STEP_CATS[k].name}</span>)}
                {b.spot !== null && <span><i className="spot" />Spot in the server</span>}
            </div>
        </div>
    );
}

function Cells({ entry }: { entry: SnipeEntry; }) {
    const m = entry.metrics;
    const spans = phaseSpans(entry);
    const took = (key: "verify" | "wait") => {
        const s = spans.find(p => p.key === key);
        return s ? formatSecs(s.end - s.start) : "-";
    };
    const isReal = entry.tags.includes("biome-verified-real");
    const cells: [string, string, string][] = [
        ["Discord delivery", m?.discordDelayMs != null ? formatSecs(m.discordDelayMs) : "-", "From Discord's servers to Sol Radar. Negative means your PC clock is a bit ahead, so read it as about zero."],
        ["Link check", took("verify"), "Checking the link leads to a Sol's RNG server you allow. Runs while Roblox starts."],
        ["Biome check", took("wait"), "Waiting for your game to show the biome."],
        ["Biome lasted", isReal && entry.biomeDurationMs != null ? formatElapsedTime(entry.biomeDurationMs) : "-", "How long the real biome lasted."],
    ];
    return (
        <div className="vc-sora-tm-cells">
            {cells.map(([label, value, tip]) => (
                <Tooltip key={label} text={tip}>
                    {props => (
                        <div {...props} className="vc-sora-tm-cell">
                            <b>{value}</b>
                            <span>{label}</span>
                        </div>
                    )}
                </Tooltip>
            ))}
        </div>
    );
}

export function TimingSection({ entry }: { entry: SnipeEntry; }) {
    const [view, setView] = React.useState<View>("summary");
    const [reading, setReading] = React.useState(false);
    const [hover, setHover] = React.useState<StepCat | null>(null);
    const m = entry.metrics;

    const read = async (force: boolean) => {
        setReading(true);
        try {
            await captureRobloxTimeline(entry.id, force);
        } finally {
            setReading(false);
        }
    };

    // Fill in missing data on open, once the join had time to finish
    React.useEffect(() => {
        if (m?.launchedAt && !isTimelineComplete(entry.robloxTimeline) && Date.now() - m.launchedAt > 5_000) void read(false);
    }, [entry.id]);

    const b = joinBreakdown(entry);

    return (
        <>
            <div className="vc-sora-tm-head">
                <span style={{ ...sectionTitle, margin: 0 }}>Timing</span>
                {b && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div className="vc-sora-tm-switch" role="group" aria-label="Timing view">
                            {(["summary", "steps"] as View[]).map(v => (
                                <button key={v} type="button" className="vc-sora-seg" aria-pressed={view === v} onClick={() => setView(v)}>
                                    {v === "summary" ? "Summary" : "Steps"}
                                </button>
                            ))}
                        </div>
                        {m?.launchedAt && (
                            <Tooltip text={reading ? "Reading Roblox's log…" : "Read Roblox's log again"}>
                                {props => (
                                    <button {...props} type="button" className="vc-sora-history-iconbtn" aria-label="Read Roblox's log again" disabled={reading} onClick={() => read(true)}>
                                        <DocIcon />
                                    </button>
                                )}
                            </Tooltip>
                        )}
                    </div>
                )}
            </div>

            {!b
                ? <span style={{ fontSize: 13, color: COLORS.muted }}>This snipe didn't join, so there is nothing to time.</span>
                : view === "summary"
                    ? <Summary entry={entry} b={b} reading={reading} onRead={() => read(true)} hover={hover} setHover={setHover} />
                    : <Steps b={b} />}

            <Cells entry={entry} />
        </>
    );
}
