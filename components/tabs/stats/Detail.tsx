/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { SnipeEntry } from "../../../stores/SnipeStore";
import { ActivityChart, HoursStrip } from "./charts";
import { coverageNote, fmtDuration, fmtRate, fmtSeconds, Group, kindOf, Measure, peakWindow, plural, RESULT_KINDS, RESULT_LABEL, Stats, timingOf, Win } from "./data";
import { anonName, Avatar, RESULT_COLOR, SplitBar, TimeAgo } from "./parts";

// --- Pieces ---

function ChevronRight() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

/** A card in the mosaic. With `onOpen` the whole card opens a page with more on the same subject. */
export function BentoTile({ className = "", label, value, onOpen, children }: {
    className?: string;
    label: string;
    value?: React.ReactNode;
    onOpen?: () => void;
    children?: React.ReactNode;
}) {
    const inner = (
        <>
            <span className="vc-sora-stats-bn-l">
                {label}
                {onOpen && <ChevronRight />}
            </span>
            {value != null && <b className="vc-sora-stats-bn-v">{value}</b>}
            {children}
        </>
    );
    const cls = `vc-sora-stats-card vc-sora-stats-panel vc-sora-stats-bn ${className}`;
    if (!onOpen) return <div className={cls}>{inner}</div>;
    return (
        <div
            className={`${cls} link`}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        >
            {inner}
        </div>
    );
}

/** The median timing with its spread. Opens the timing page when there are enough joins to say something. */
export function TimingTile({ stats, measure, onOpen, className = "" }: { stats: Stats; measure: Measure; onOpen: () => void; className?: string; }) {
    const r = stats.timing && stats.timing.n >= 5 ? stats.timing : null;
    return (
        <BentoTile
            className={className}
            label={`⚡ ${measure.label}`}
            value={r ? <>{fmtSeconds(r.p50)}<small>median of {plural(r.n, "snipe")}</small></> : "-"}
            onOpen={r ? onOpen : undefined}
        >
            {r ? (
                <>
                    <div className="vc-sora-stats-rng"><i style={{ left: `${r.p50 / r.max * 100}%`, width: `${(r.p90 - r.p50) / r.max * 100}%` }} /></div>
                    <div className="vc-sora-stats-bn-sp">
                        <span>Fastest {fmtSeconds(r.min)}</span>
                        <span>Slowest {fmtSeconds(r.max)}</span>
                    </div>
                </>
            ) : <span className="vc-sora-stats-bn-s">Needs 5 snipes</span>}
        </BentoTile>
    );
}

export function ResultLabel({ entry }: { entry: SnipeEntry; }) {
    const kind = kindOf(entry);
    if (kind === "real" || kind === "bait" || kind === "timeout" || kind === "unverified") {
        return <span className="vc-sora-stats-res"><i style={{ background: RESULT_COLOR[kind] }} />{RESULT_LABEL[kind]}</span>;
    }
    return <span className="vc-sora-stats-res"><i style={{ background: "var(--text-muted)" }} />{kind === "failed" ? "Failed" : kind === "ignored" ? "Ignored" : "Other"}</span>;
}

/** The busiest three hours, with how many snipes fell in them, over the 24 hours as a strip. Opens the When page. */
export function WhenTile({ stats, onOpen, className = "" }: { stats: Stats; onOpen: () => void; className?: string; }) {
    const peak = peakWindow(stats.hours);
    return (
        <BentoTile
            className={className}
            label="Busiest hours"
            value={peak ? <>{peak.range}<small>{peak.count} of {plural(stats.n, "snipe")}</small></> : "-"}
            onOpen={peak ? onOpen : undefined}
        >
            {peak ? <HoursStrip hours={stats.hours} axis /> : <span className="vc-sora-stats-bn-s">Needs 5 snipes</span>}
        </BentoTile>
    );
}

/** The three busiest authors. Opens the Who and where page. */
export function AuthorsTile({ stats, anonymize, onOpen, className = "" }: { stats: Stats; anonymize: boolean; onOpen: () => void; className?: string; }) {
    return (
        <BentoTile className={className} label="Top authors" onOpen={stats.authors.length ? onOpen : undefined}>
            <AuthorRows authors={stats.authors} anonymize={anonymize} />
        </BentoTile>
    );
}

/** Snipes as a table: a header, then one separated row each. The last column is the timing picked in `measure`. */
export function SnipeTable({ entries, anonymize, empty = "No snipes in this period.", measure, time }: {
    entries: SnipeEntry[];
    anonymize: boolean;
    empty?: string;
    measure: Measure;
    /** Overrides the timing shown, for lists that already know it. */
    time?: (e: SnipeEntry) => number | null;
}) {
    if (!entries.length) return <span className="vc-sora-stats-low">{empty}</span>;
    return (
        <div className="vc-sora-stats-table">
            <div className="vc-sora-stats-rec head">
                <span>When</span>
                <span>Snipe</span>
                <span>Result</span>
                <span>Time</span>
            </div>
            {entries.map(e => {
                const ms = time ? time(e) : timingOf(e, measure.steps);
                return (
                    <div key={e.id} className="vc-sora-stats-rec">
                        <TimeAgo className="vc-sora-stats-rec-t" ts={e.timestamp} anonymize={anonymize} />
                        <span className="vc-sora-stats-rec-who">
                            <b>{anonymize ? "Hidden" : e.authorName ?? "Unknown"}</b>
                            {!anonymize && e.channelName && <em>in #{e.channelName.replace(/^#/, "")}</em>}
                        </span>
                        <ResultLabel entry={e} />
                        <span className="vc-sora-stats-rec-ms">{fmtSeconds(ms)}</span>
                    </div>
                );
            })}
        </div>
    );
}

function AuthorRows({ authors, anonymize }: { authors: Group[]; anonymize: boolean; }) {
    if (!authors.length) return <span className="vc-sora-stats-low">Nothing yet</span>;
    return (
        <div className="vc-sora-stats-table">
            {authors.slice(0, 3).map((g, i) => (
                <div key={g.key} className="vc-sora-stats-mw">
                    <Avatar src={g.avatar} name={g.name} anonymize={anonymize} />
                    <span className="vc-sora-stats-mw-name">{anonName("Author", i, g.name, anonymize)}</span>
                    <b>{g.n}</b>
                    <em>{fmtRate(g.v ? Math.round(g.real / g.v * 100) : null)}</em>
                </div>
            ))}
        </div>
    );
}

// --- Detail ---

/** One trigger or server: a mosaic of compact cards. The result card leads, the rest sit around it. */
export function Detail({ name, icon, stats, win, anonymize, measure, onTiming, onWho, onWhen }: {
    name: string;
    icon: React.ReactNode;
    stats: Stats;
    win: Win;
    anonymize: boolean;
    measure: Measure;
    onTiming: () => void;
    onWho: () => void;
    onWhen: () => void;
}) {
    const note = [coverageNote(stats), stats.n > 0 && stats.n < 10 ? `Only ${plural(stats.n, "snipe")} so far, so these numbers can still move a lot.` : ""].filter(Boolean).join(" ");

    return (
        <>
            <div className="vc-sora-stats-dhead">
                {icon}
                <div>
                    <div className="vc-sora-stats-dhead-name">{name}</div>
                    <div className="vc-sora-stats-dhead-sub">
                        {plural(stats.all, "snipe")} in {win.label}{stats.last != null && <> · last <TimeAgo ts={stats.last} anonymize={anonymize} /></>}
                    </div>
                </div>
            </div>

            <div className="vc-sora-stats-bento">
                <BentoTile className="c2 r2 res" label="Real rate" value={fmtRate(stats.rate)}>
                    {stats.n > 0 ? (
                        <>
                            <SplitBar counts={stats} />
                            <div className="vc-sora-stats-lg">
                                {RESULT_KINDS.map(k => (
                                    <div key={k} className="vc-sora-stats-lg-row">
                                        <span><i style={{ background: RESULT_COLOR[k] }} />{RESULT_LABEL[k]}</span>
                                        <b>{stats[k]}</b>
                                    </div>
                                ))}
                            </div>
                            {note && <span className="vc-sora-stats-bn-s">{note}</span>}
                        </>
                    ) : <span className="vc-sora-stats-bn-s">No snipes in this period yet.</span>}
                </BentoTile>

                <TimingTile className="c2" stats={stats} measure={measure} onOpen={onTiming} />

                <BentoTile className="c1" label="Real biome" value={fmtDuration(stats.avgBiome)}>
                    <span className="vc-sora-stats-bn-s">lasted on average</span>
                </BentoTile>
                <BentoTile className="c1" label="Failed joins" value={stats.failed}>
                    <span className="vc-sora-stats-bn-s">{stats.ignored} ignored</span>
                </BentoTile>

                <BentoTile className="c4" label="Activity">
                    <ActivityChart stats={stats} />
                </BentoTile>

                <WhenTile className="c2" stats={stats} onOpen={onWhen} />
                <AuthorsTile className="c2" stats={stats} anonymize={anonymize} onOpen={onWho} />

                <BentoTile className="c4" label="Recent snipes">
                    <SnipeTable entries={stats.recent} anonymize={anonymize} measure={measure} />
                </BentoTile>
            </div>
        </>
    );
}
