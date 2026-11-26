/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SnipeEntry } from "../../../stores/SnipeStore";
import { ActivityChart, Spark } from "./charts";
import { coverageNote, fmtDuration, fmtRate, Group, Measure, Stats, TriggerRow } from "./data";
import { AuthorsTile, BentoTile, TimingTile, WhenTile } from "./Detail";
import { GroupTable, Section, SplitBar, summaryCaption, SummaryCard, TriggerIcon } from "./parts";
import { TimeoutByTiming, TimeoutsHint } from "./Timeouts";

// --- Trigger table ---

function TriggerTable({ rows, onOpen }: { rows: TriggerRow[]; onOpen: (row: TriggerRow) => void; }) {
    return (
        <div className="vc-sora-stats-card vc-sora-stats-rows">
            <div className="vc-sora-stats-thead">
                <span>Trigger</span>
                <span>Activity</span>
                <span>Result split</span>
                <span>Real</span>
                <span>Snipes</span>
            </div>
            {rows.map(r => (
                <button key={r.name} type="button" className="vc-sora-stats-trow" onClick={() => onOpen(r)}>
                    <span className="vc-sora-stats-trow-name">
                        <TriggerIcon src={r.iconUrl} />
                        <b>{r.name}</b>
                    </span>
                    <Spark buckets={r.stats.buckets} />
                    <SplitBar counts={r.stats} />
                    <span className="vc-sora-stats-trow-rate">{fmtRate(r.stats.rate)}</span>
                    <span className="vc-sora-stats-trow-n">{r.stats.n}</span>
                </button>
            ))}
        </div>
    );
}

// --- Overview ---

export function Overview({ entries, stats, rows, measure, onOpen, onOpenServer, onTiming, onWhen, onWho }: {
    entries: SnipeEntry[];
    stats: Stats;
    rows: TriggerRow[];
    onOpen: (row: TriggerRow) => void;
    onOpenServer: (group: Group) => void;
    measure: Measure;
    onTiming: () => void;
    onWhen: () => void;
    onWho: () => void;
}) {
    if (!stats.n) return <SummaryCard stats={stats} caption="" />;

    return (
        <>
            <SummaryCard stats={stats} caption={summaryCaption(stats)} note={coverageNote(stats)} />

            <div className="vc-sora-stats-bento">
                <TimingTile className="c2 r2" stats={stats} measure={measure} onOpen={onTiming} />
                <BentoTile className="c1" label="Real biome" value={fmtDuration(stats.avgBiome)}>
                    <span className="vc-sora-stats-bn-s">lasted on average</span>
                </BentoTile>
                <BentoTile className="c1" label="Not verified" value={stats.unverified}>
                    <span className="vc-sora-stats-bn-s">no biome result</span>
                </BentoTile>
                <BentoTile className="c1" label="Failed joins" value={stats.failed} />
                <BentoTile className="c1" label="Ignored" value={stats.ignored} />
                <WhenTile className="c2" stats={stats} onOpen={onWhen} />
                <AuthorsTile className="c2" stats={stats} onOpen={onWho} />
                <BentoTile className="c4" label="Activity">
                    <ActivityChart stats={stats} />
                </BentoTile>
                <BentoTile className="c4 otl" label="Timeouts by timing">
                    <TimeoutsHint />
                    <TimeoutByTiming entries={entries} />
                </BentoTile>
            </div>

            <Section title="Triggers" right={<span className="vc-sora-stats-hint">Click a trigger for details</span>} />
            <TriggerTable rows={rows} onOpen={onOpen} />

            <Section title="Servers" right={<span className="vc-sora-stats-hint">Click a server for details</span>} />
            <div className="vc-sora-stats-card vc-sora-stats-panel">
                <GroupTable groups={stats.servers} kind="Server" onOpen={onOpenServer} />
            </div>
        </>
    );
}
