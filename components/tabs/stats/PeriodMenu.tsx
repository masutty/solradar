/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, Menu, React } from "@webpack/common";

import { BOLT_PRESETS, sameSteps } from "../../../services/JoinTimeline";
import { Measure, Period, PERIOD_PRESETS, startOfDay, Win } from "./data";

function CalendarIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
            <path d="M3.5 10h17M8 3v4M16 3v4" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

const toInput = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fromInput = (value: string) => new Date(`${value}T00:00:00`).getTime();

function openMenu(e: React.MouseEvent, period: Period, win: Win, onChange: (p: Period) => void) {
    // The menu is placed once and does not redraw after a pick, so it closes on a pick or a resize
    const onResize = () => ContextMenuApi.closeContextMenu();
    window.addEventListener("resize", onResize);
    const pick = (p: Period) => { onChange(p); ContextMenuApi.closeContextMenu(); };

    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu
            navId="vc-sora-stats-period"
            onClose={() => { window.removeEventListener("resize", onResize); ContextMenuApi.closeContextMenu(); }}
            aria-label="Period"
        >
            {PERIOD_PRESETS.map(p => (
                <Menu.MenuRadioItem
                    key={p.id}
                    id={`vc-sora-stats-period-${p.id}`}
                    group="vc-sora-stats-period"
                    label={p.label}
                    checked={period.id === p.id}
                    action={() => pick({ id: p.id })}
                />
            ))}
            <Menu.MenuSeparator />
            <Menu.MenuRadioItem
                id="vc-sora-stats-period-custom"
                group="vc-sora-stats-period"
                label="Custom range"
                checked={period.id === "custom"}
                action={() => pick({ id: "custom", from: period.id === "custom" ? period.from : win.since, to: period.id === "custom" ? period.to : win.until - 1 })}
            />
        </Menu.Menu>
    ));
}

/** A dropdown for the period. "Custom range" shows two date fields beside it. */
export function PeriodMenu({ period, win, onChange }: { period: Period; win: Win; onChange: (p: Period) => void; }) {
    const today = startOfDay(Date.now());
    return (
        <div className="vc-sora-stats-period">
            {period.id === "custom" && (
                <>
                    <input
                        type="date"
                        className="vc-sora-stats-date"
                        aria-label="From"
                        value={toInput(win.since)}
                        max={toInput(today)}
                        onChange={e => e.target.value && onChange({ id: "custom", from: fromInput(e.target.value), to: period.to ?? win.until - 1 })}
                    />
                    <span className="vc-sora-stats-date-to">to</span>
                    <input
                        type="date"
                        className="vc-sora-stats-date"
                        aria-label="To"
                        value={toInput(win.until - 1)}
                        max={toInput(today)}
                        onChange={e => e.target.value && onChange({ id: "custom", from: period.from ?? win.since, to: fromInput(e.target.value) })}
                    />
                </>
            )}
            <button type="button" className="vc-sora-stats-period-btn" aria-haspopup="menu" onClick={e => openMenu(e, period, win, onChange)}>
                <CalendarIcon />
                <span>{period.id === "custom" ? "Custom range" : win.short}</span>
                <ChevronIcon />
            </button>
        </div>
    );
}

// --- Measure ---

function openMeasureMenu(e: React.MouseEvent, measure: Measure, onChange: (steps: readonly string[]) => void) {
    const onResize = () => ContextMenuApi.closeContextMenu();
    window.addEventListener("resize", onResize);

    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu
            navId="vc-sora-stats-measure"
            onClose={() => { window.removeEventListener("resize", onResize); ContextMenuApi.closeContextMenu(); }}
            aria-label="What to time"
        >
            {BOLT_PRESETS.map(p => (
                <Menu.MenuRadioItem
                    key={p.label}
                    id={`vc-sora-stats-measure-${p.label}`}
                    group="vc-sora-stats-measure"
                    label={p.label}
                    checked={sameSteps(p.steps, measure.steps)}
                    action={() => { onChange(p.steps); ContextMenuApi.closeContextMenu(); }}
                />
            ))}
        </Menu.Menu>
    ));
}

/** A dropdown for which part of the join is timed. It only changes the page it is on. */
export function MeasureMenu({ measure, onChange }: { measure: Measure; onChange: (steps: readonly string[]) => void; }) {
    return (
        <button type="button" className="vc-sora-stats-period-btn" aria-haspopup="menu" onClick={e => openMeasureMenu(e, measure, onChange)}>
            <span aria-hidden>⚡</span>
            <span>{measure.label}</span>
            <ChevronIcon />
        </button>
    );
}
