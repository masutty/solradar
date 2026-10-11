/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./history.css";

import { DeleteIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Alerts, ContextMenuApi, Menu, React, ScrollerThin, TextInput, Tooltip, useState } from "@webpack/common";

import { settings } from "../../../settings";
import { SnipeEntry, SnipeStore, useSnipeHistory } from "../../../stores/SnipeStore";
import { UIState } from "../../../stores/UIStateStore";
import { SnipeTag } from "../../../types";
import { formatElapsedTime } from "../../../utils";
import { JoinLockBanner } from "../../JoinLockBanner";
import { PendingActionBanner } from "../../PendingActionBanner";
import { DeleteButton } from "../../ui/buttons/DeleteButton";
import Spoiler from "../../ui/Spoiler";
import { COLORS } from "../../ui/styles";
import { useShiftHeld } from "../../ui/useShiftHeld";
import { FallbackImage, formatClock, getSnipeStatus } from "./components";
import { openJoinModal } from "./JoinModal";
import { openSnipeContextMenu } from "./SnipeContextMenu";
import { OutcomeGlyph } from "./SnipeTimeline";
import { outcomeIcon } from "./steps";

// --- Filters ---

type Filter = SnipeTag | "all";

const FILTERS: { tag: Filter; label: string; color?: string; }[] = [
    { tag: "all", label: "All" },
    { tag: "biome-verified-real", label: "Real", color: COLORS.positive },
    { tag: "biome-verified-bait", label: "Bait", color: COLORS.danger },
    { tag: "biome-verified-timeout", label: "Timed out", color: COLORS.warning },
    { tag: "link-verified-unsafe", label: "Unsafe link", color: COLORS.danger },
    { tag: "failed", label: "Failed", color: COLORS.danger },
];

const MAX_STAGGER_MS = 300;

function countFor(entries: SnipeEntry[], tag: Filter): number {
    return tag === "all" ? entries.length : entries.filter(e => e.tags.includes(tag)).length;
}

function dayLabel(ts: number): string {
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const days = Math.floor((startOfToday - new Date(ts).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    return new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function timeAgo(ts: number): string {
    const minutes = Math.floor((Date.now() - ts) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

// --- Icons ---

function FilterIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
    );
}

function MoreIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
        </svg>
    );
}

// --- Menus ---

function confirmClearHistory() {
    Alerts.show({
        title: "Clear snipe history?",
        body: <Paragraph>This deletes every snipe in Snipe History and resets the stats. It can't be undone.</Paragraph>,
        confirmText: "Clear history",
        cancelText: "Cancel",
        onConfirm: () => SnipeStore.clear(),
    });
}

function openFilterMenu(e: React.MouseEvent, entries: SnipeEntry[], current: Filter, onChange: (f: Filter) => void) {
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-sora-history-filter" onClose={ContextMenuApi.closeContextMenu} aria-label="Filter snipes">
            {FILTERS.map(f => (
                <Menu.MenuRadioItem
                    key={f.tag}
                    id={`vc-sora-history-filter-${f.tag}`}
                    group="vc-sora-history-filter"
                    label={`${f.label} (${countFor(entries, f.tag)})`}
                    checked={current === f.tag}
                    action={() => onChange(f.tag)}
                />
            ))}
        </Menu.Menu>
    ));
}

function openMoreMenu(e: React.MouseEvent, hasEntries: boolean) {
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-sora-history-more" onClose={ContextMenuApi.closeContextMenu} aria-label="Snipe history options">
            <Menu.MenuItem
                id="vc-sora-history-clear"
                label="Clear history"
                color="danger"
                disabled={!hasEntries}
                leadingAccessory={{ type: "icon", icon: DeleteIcon }}
                action={confirmClearHistory}
            />
        </Menu.Menu>
    ));
}

// --- Card ---

function Hidden({ anonymize, children }: { anonymize: boolean; children: React.ReactNode; }) {
    return anonymize ? <Spoiler>{children}</Spoiler> : <>{children}</>;
}

function SnipeCard({ entry, index, shiftHeld }: { entry: SnipeEntry; index: number; shiftHeld: boolean; }) {
    const { anonymizeEverything } = settings.use(["anonymizeEverything"]);
    const status = getSnipeStatus(entry);
    const isReal = entry.tags.includes("biome-verified-real");

    // Each field shortens on its own, with the full value in a tooltip
    const field = (className: string, tip: string, content: React.ReactNode) => (
        <Tooltip text={tip}>
            {props => (
                <span {...props} className={`vc-sora-history-field ${className}`}>
                    <Hidden anonymize={anonymizeEverything}>{content}</Hidden>
                </span>
            )}
        </Tooltip>
    );
    const sep = <span className="vc-sora-history-sep">·</span>;

    return (
        <div
            className={`vc-sora-history-card${status.quiet ? " quiet" : ""}`}
            style={{ "--sora-s": status.color, animationDelay: `${Math.min(index * 30, MAX_STAGGER_MS)}ms` } as React.CSSProperties}
            onClick={() => openJoinModal(entry)}
            onContextMenu={e => { e.preventDefault(); openSnipeContextMenu(e, entry); }}
        >
            {shiftHeld && <DeleteButton visible hint="Remove from history" onClick={() => SnipeStore.delete(entry.id)} />}
            <div className="vc-sora-history-icon">
                <FallbackImage src={entry.iconUrl} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />
                <Tooltip text={status.label}>
                    {props => (
                        <span {...props} className="vc-sora-history-badge">
                            <OutcomeGlyph icon={outcomeIcon(entry)} size={10} />
                        </span>
                    )}
                </Tooltip>
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 1 }}>
                <span className="vc-sora-history-title">{entry.triggerName}</span>
                <div className="vc-sora-history-line">
                    {entry.authorName && <>
                        {field("author", `Posted by ${entry.authorName}`, (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
                                <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.authorName}</span>
                            </span>
                        ))}
                        {(entry.channelName || entry.guildName) && sep}
                    </>}
                    {entry.channelName && <>
                        {field("channel", `#${entry.channelName}`, `#${entry.channelName}`)}
                        {entry.guildName && sep}
                    </>}
                    {entry.guildName && field("server", entry.guildName, entry.guildName)}
                </div>
            </div>

            <div className="vc-sora-history-side">
                <Tooltip text={timeAgo(entry.timestamp)}>
                    {props => <span {...props} className="vc-sora-history-clock">{formatClock(entry.timestamp)}</span>}
                </Tooltip>
                {(entry.metrics || (isReal && entry.biomeDurationMs != null)) && (
                    <span className="vc-sora-history-stats">
                        {entry.metrics && (
                            <Tooltip text="Reaction time: from the message to Roblox opening the server">
                                {props => <span {...props}>⚡ {Math.round(entry.metrics!.timeToJoinMs)}ms</span>}
                            </Tooltip>
                        )}
                        {isReal && entry.biomeDurationMs != null && (
                            <Tooltip text="How long the real biome lasted">
                                {props => <span {...props}>🌿 {formatElapsedTime(entry.biomeDurationMs!)}</span>}
                            </Tooltip>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
}

// --- RecentJoinsTab ---

export function RecentJoinsTab() {
    const entries = useSnipeHistory();
    const saved = UIState.get("recentJoins");
    const shiftHeld = useShiftHeld();
    const [search, setSearch] = useState(saved.search);
    const [filter, setFilter] = useState<Filter>(saved.tagFilter);

    const handleSearch = (v: string) => {
        setSearch(v);
        UIState.set("recentJoins", { search: v });
    };

    const handleFilter = (f: Filter) => {
        setFilter(f);
        UIState.set("recentJoins", { tagFilter: f });
    };

    const filtered = React.useMemo(() => {
        const q = search.trim().toLowerCase();
        return entries.filter(e =>
            (filter === "all" || e.tags.includes(filter))
            && (!q || [e.triggerName, e.authorName, e.channelName, e.guildName].some(v => v?.toLowerCase().includes(q)))
        );
    }, [entries, filter, search]);

    const activeFilter = FILTERS.find(f => f.tag === filter) ?? FILTERS[0];

    // Group consecutive entries (newest first) under a day heading
    let lastDay = "";
    const dayCounts = React.useMemo(() => {
        const m = new Map<string, number>();
        filtered.forEach(e => { const d = dayLabel(e.timestamp); m.set(d, (m.get(d) ?? 0) + 1); });
        return m;
    }, [filtered]);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                            value={search}
                            onChange={handleSearch}
                            placeholder={`Search ${entries.length} ${entries.length === 1 ? "snipe" : "snipes"} by trigger, author, channel...`}
                        />
                    </div>
                    <Tooltip text="Filter by result">
                        {props => (
                            <button
                                {...props}
                                type="button"
                                className={`vc-sora-history-sbtn${filter !== "all" ? " active" : ""}`}
                                style={{ "--sora-c": activeFilter.color ?? COLORS.brand } as React.CSSProperties}
                                onClick={e => openFilterMenu(e, entries, filter, handleFilter)}
                            >
                                <FilterIcon />
                                {activeFilter.label}
                                {filter !== "all" && <span style={{ fontSize: 11, opacity: 0.8 }}>{filtered.length}</span>}
                            </button>
                        )}
                    </Tooltip>
                    <Tooltip text="More options">
                        {props => (
                            <button
                                {...props}
                                type="button"
                                className="vc-sora-history-sbtn"
                                style={{ padding: "0 7px" }}
                                aria-label="More options"
                                onClick={e => openMoreMenu(e, entries.length > 0)}
                            >
                                <MoreIcon />
                            </button>
                        )}
                    </Tooltip>
                </div>
                <JoinLockBanner variant="minimal" />
                <PendingActionBanner variant="minimal" />
            </div>

            <ScrollerThin style={{ flex: 1, paddingRight: 8 }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", marginTop: 40 }}>
                        <Paragraph size="sm">
                            {entries.length === 0
                                ? "No snipes yet. Links you snipe will show up here."
                                : "No snipes match your search or filter."}
                        </Paragraph>
                    </div>
                ) : (
                    <div style={{ paddingBottom: 12 }}>
                        {filtered.map((entry, i) => {
                            const day = dayLabel(entry.timestamp);
                            const count = dayCounts.get(day) ?? 0;
                            const heading = day !== lastDay
                                ? <div className="vc-sora-history-day">{day}<span className="vc-sora-history-day-count">{count} {count === 1 ? "snipe" : "snipes"}</span></div>
                                : null;
                            lastDay = day;
                            return (
                                <React.Fragment key={entry.id}>
                                    {heading}
                                    <SnipeCard entry={entry} index={i} shiftHeld={shiftHeld} />
                                </React.Fragment>
                            );
                        })}
                    </div>
                )}
            </ScrollerThin>
        </div>
    );
}
