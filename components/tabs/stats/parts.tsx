/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildStore, React, Tooltip } from "@webpack/common";

import { guildIconUrl } from "../../ui/idFilter/resolve";
import { Note } from "../../ui/Note";
import { card, COLORS, descriptionText, sectionTitle } from "../../ui/styles";
import { FallbackImage, formatTimeAgo } from "../recentJoins/components";
import { Bucket, bucketLabel, BucketUnit, bucketTotal, Counts, fmtRate, Group, plural, RESULT_KINDS, RESULT_LABEL, RESULT_WORD, ResultKind, Stats } from "./data";

export const RESULT_COLOR: Record<ResultKind, string> = {
    real: COLORS.positive,
    bait: COLORS.danger,
    timeout: COLORS.warning,
    unverified: COLORS.muted,
};

// --- Small pieces ---

export function Section({ title, right }: { title: string; right?: React.ReactNode; }) {
    return (
        <div className="vc-sora-stats-sec">
            <span style={{ ...sectionTitle, margin: 0 }}>{title}</span>
            {right}
        </div>
    );
}

export function TriggerIcon({ src, size = 22 }: { src?: string; size?: number; }) {
    return <FallbackImage src={src} style={{ width: size, height: size, borderRadius: size > 30 ? 8 : 5, flexShrink: 0, objectFit: "cover" }} />;
}

/** What a split bar shows on hover: the total, and one line per result that has any. */
export function CountsTip({ counts, title }: { counts: Counts; title?: string; }) {
    const total = RESULT_KINDS.reduce((sum, k) => sum + counts[k], 0);
    return (
        <div className="vc-sora-stats-tip">
            <b>{title ?? plural(total, "snipe")}</b>
            {title && <span>{plural(total, "snipe")}</span>}
            {RESULT_KINDS.filter(k => counts[k] > 0).map(k => (
                <span key={k} className="vc-sora-stats-tip-row">
                    <i style={{ background: RESULT_COLOR[k] }} />
                    {counts[k]} {RESULT_WORD[k]}
                </span>
            ))}
        </div>
    );
}

/** One bar split by result. Hovering anywhere on it lists every result, since a small slice is hard to hit. */
export function SplitBar({ counts, height = 8 }: { counts: Counts; height?: number; }) {
    const shown = RESULT_KINDS.filter(k => counts[k] > 0);
    return (
        <Tooltip text={<CountsTip counts={counts} />}>
            {props => (
                <div {...props} className="vc-sora-stats-bar" style={{ height }}>
                    {shown.map(k => <i key={k} style={{ flex: counts[k], background: RESULT_COLOR[k] }} />)}
                </div>
            )}
        </Tooltip>
    );
}

export function Legend() {
    return (
        <div className="vc-sora-stats-legend">
            {RESULT_KINDS.map(k => (
                <span key={k}><i style={{ background: RESULT_COLOR[k] }} />{RESULT_LABEL[k]}</span>
            ))}
        </div>
    );
}

export function Tile({ value, label, hint }: { value: React.ReactNode; label: string; hint?: string; }) {
    const tile = (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.2, color: COLORS.text }}>{value}</span>
            <span style={descriptionText}>{label}</span>
        </div>
    );
    if (!hint) return tile;
    return <Tooltip text={hint}>{props => <div {...props}>{tile}</div>}</Tooltip>;
}

export function Tiles({ children }: { children: React.ReactNode; }) {
    return <div className="vc-sora-stats-tiles">{children}</div>;
}

function InfoIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
        </svg>
    );
}

// --- Summary ---

/** The first read of a page: the real rate, one bar split by result, and the four totals. */
export function SummaryCard({ stats, caption, note }: { stats: Stats; caption: string; note?: string; }) {
    if (!stats.n) {
        return <Note>No snipes in this period yet. They show up here once Sol Radar joins one.</Note>;
    }

    return (
        <div className="vc-sora-stats-card vc-sora-stats-summary">
            <span className="vc-sora-stats-bn-l">Real rate</span>
            <div className="vc-sora-stats-headline">
                <span className="vc-sora-stats-big">{fmtRate(stats.rate)}</span>
                <span className="vc-sora-stats-what">{caption}</span>
            </div>
            <SplitBar counts={stats} />
            <div className="vc-sora-stats-totals">
                {RESULT_KINDS.map(k => (
                    <div key={k} className="vc-sora-stats-total">
                        <span className="vc-sora-stats-total-k"><i style={{ background: RESULT_COLOR[k] }} />{RESULT_LABEL[k]}</span>
                        <span className="vc-sora-stats-total-v">{stats[k]}</span>
                    </div>
                ))}
            </div>
            {note && (
                <div className="vc-sora-stats-note">
                    <InfoIcon />
                    <span>{note}</span>
                </div>
            )}
        </div>
    );
}

export function summaryCaption(stats: Stats) {
    return `of ${stats.v} verified`;
}

/** What a chart bar shows on hover: the date, the total, and one line per result that has any. */
export function BucketTip({ unit, bucket }: { unit: BucketUnit; bucket: Bucket; }) {
    return (
        <div className="vc-sora-stats-tip">
            <b>{bucketLabel(unit, bucket.start, true)}</b>
            <span>{plural(bucketTotal(bucket), "snipe")}</span>
            {RESULT_KINDS.filter(k => bucket[k] > 0).map(k => (
                <span key={k} className="vc-sora-stats-tip-row">
                    <i style={{ background: RESULT_COLOR[k] }} />
                    {bucket[k]} {RESULT_WORD[k]}
                </span>
            ))}
        </div>
    );
}

// --- Time ---

/** "34m ago", with the full date and time on hover. Hidden while anonymizing, like in Snipe History. */
export function TimeAgo({ ts, anonymize, className }: { ts: number; anonymize: boolean; className?: string; }) {
    if (anonymize) return <span className={className}>{formatTimeAgo(ts)}</span>;
    return (
        <Tooltip text={new Date(ts).toLocaleString()}>
            {props => <span {...props} className={className}>{formatTimeAgo(ts)}</span>}
        </Tooltip>
    );
}

// --- Who and where ---

/** The server's icon, read from Discord's memory. Missing when you left the server or the snipe has no server id. */
export function serverIconUrl(key: string): string | undefined {
    const guild = GuildStore.getGuild(key);
    return guild ? guildIconUrl(guild) : undefined;
}

/** The real name, or "Server 1", "Author 2"... when anonymizing. */
export function anonName(kind: "Server" | "Channel" | "Author", index: number, name: string, anonymize: boolean) {
    return anonymize ? `${kind} ${index + 1}` : name;
}

export function Avatar({ src, name, anonymize }: { src?: string; name: string; anonymize: boolean; }) {
    if (anonymize || !src) {
        return <span className="vc-sora-stats-av">{anonymize ? "?" : name[0]?.toUpperCase() ?? "?"}</span>;
    }
    return <FallbackImage src={src} style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }} />;
}

/** Servers, channels or authors as a table: name, split bar, real rate, snipes. With `onOpen` each row opens its own page. */
export function GroupTable({ groups, kind, anonymize, onOpen }: {
    groups: Group[];
    kind: "Server" | "Channel" | "Author";
    anonymize: boolean;
    onOpen?: (group: Group, label: string) => void;
}) {
    if (!groups.length) return <span className="vc-sora-stats-low">Nothing yet.</span>;
    return (
        <div className="vc-sora-stats-table">
            <div className="vc-sora-stats-who head">
                <span>{kind}</span>
                <span>Result split</span>
                <span>Real</span>
                <span>Snipes</span>
            </div>
            {groups.map((g, i) => {
                const label = anonName(kind, i, g.name, anonymize);
                const cells = (
                    <>
                        <span className="vc-sora-stats-who-name">
                            {kind !== "Channel" && <Avatar src={kind === "Author" ? g.avatar : serverIconUrl(g.key)} name={g.name} anonymize={anonymize} />}
                            <span>{label}</span>
                        </span>
                        <SplitBar counts={g} height={6} />
                        <span className="vc-sora-stats-who-rate">{fmtRate(g.v ? Math.round(g.real / g.v * 100) : null)}</span>
                        <span className="vc-sora-stats-who-n">{g.n}</span>
                    </>
                );
                return onOpen
                    ? <button key={g.key} type="button" className="vc-sora-stats-who link" onClick={() => onOpen(g, label)}>{cells}</button>
                    : <div key={g.key} className="vc-sora-stats-who">{cells}</div>;
            })}
        </div>
    );
}
