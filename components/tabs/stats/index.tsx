/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./stats.css";

import { React } from "@webpack/common";

import { settings } from "../../../settings";
import { SnipeEntry, useSnipeHistory } from "../../../stores/SnipeStore";
import { tabColumn } from "../../ui/styles";
import { computeStats, measureOf, OutcomeFilter, outcomeOf, Period, serverKey, triggerRows, windowOf } from "./data";
import { Detail } from "./Detail";
import { Overview } from "./Overview";
import { TimingPage, WhenPage, WhoPage } from "./Pages";
import { serverIconUrl, TriggerIcon } from "./parts";
import { MeasureMenu, PeriodMenu } from "./PeriodMenu";
import { Selection } from "./pick";
import { TriggerPicker } from "./TriggerPicker";

/** What the tab is showing a closer look at: a trigger or a server. */
interface Subject { type: "trigger" | "server"; key: string; name: string; iconUrl?: string; }
type Page = "timing" | "who" | "when";

const PAGE_LABEL: Record<Page, string> = { timing: "Timing", who: "Who and where", when: "When" };

function ChevronLeft() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
        </svg>
    );
}

/** Scrolls the tab back to the very top, padding included, the way it first opens. scrollIntoView would drop the padding and make the page jump. */
function scrollToTop(el: HTMLElement | null) {
    for (let node = el?.parentElement; node; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
            node.scrollTop = 0;
            return;
        }
    }
}

export function StatsTab() {
    const [period, setPeriod] = React.useState<Period>({ id: "1d" });
    const [subject, setSubject] = React.useState<Subject | null>(null);
    const [page, setPage] = React.useState<Page | null>(null);
    const [selection, setSelection] = React.useState<Selection>(null);
    const allEntries = useSnipeHistory();
    const { anonymizeEverything, historyBoltSteps } = settings.use(["anonymizeEverything", "historyBoltSteps"]);
    // Timing follows the choice made for the ⚡ in Snipe History (Settings, Interface) until another is picked here
    const [pickedSteps, setPickedSteps] = React.useState<readonly string[] | null>(null);
    const stepsKey = (pickedSteps ?? historyBoltSteps).join(",");
    const measure = React.useMemo(() => measureOf(stepsKey ? stepsKey.split(",") : []), [stepsKey]);
    const root = React.useRef<HTMLDivElement>(null);

    // Entries are newest first, so the oldest one is the last
    const firstTs = allEntries.length ? allEntries[allEntries.length - 1].timestamp : Infinity;
    const win = React.useMemo(() => windowOf(period, firstTs), [period, firstTs]);

    const inWindow = React.useMemo(
        () => allEntries.filter(e => e.timestamp >= win.since && e.timestamp < win.until),
        [allEntries, win]
    );
    const counts = React.useMemo(() => {
        const map = new Map<string, number>();
        for (const e of inWindow) map.set(e.triggerName, (map.get(e.triggerName) ?? 0) + 1);
        return map;
    }, [inWindow]);
    const picked = React.useMemo(
        () => selection ? inWindow.filter(e => selection.has(e.triggerName)) : inWindow,
        [inWindow, selection]
    );
    const rows = React.useMemo(() => triggerRows(picked, win, measure.steps), [picked, win, measure]);
    const overall = React.useMemo(() => computeStats(picked, win, undefined, measure.steps), [picked, win, measure]);
    // What the page below the overview looks at: one trigger or server, or every snipe when a page is open without one
    const viewEntries = React.useMemo(
        () => subject != null
            ? picked.filter(e => subject.type === "trigger" ? e.triggerName === subject.key : serverKey(e) === subject.key)
            : page ? picked : null,
        [picked, subject, page]
    );
    // Timing can look at one outcome only; the other pages always see every snipe
    const [outcome, setOutcome] = React.useState<OutcomeFilter>("all");
    const keep = (e: SnipeEntry) => outcome === "all" || outcomeOf(e) === outcome;
    const timed = page === "timing" && outcome !== "all";
    const shownEntries = React.useMemo(
        () => viewEntries && timed ? viewEntries.filter(keep) : viewEntries,
        [viewEntries, timed, outcome]
    );
    const shownRows = React.useMemo(
        () => timed ? triggerRows(picked.filter(keep), win, measure.steps) : rows,
        [timed, picked, outcome, win, measure, rows]
    );
    const outcomeCounts = React.useMemo(() => {
        const c: Record<OutcomeFilter, number> = { all: 0, got: 0, timeout: 0, unknown: 0 };
        for (const e of viewEntries ?? []) {
            const o = outcomeOf(e);
            if (!o) continue;
            c[o]++;
            c.all++;
        }
        return c;
    }, [viewEntries]);
    const view = React.useMemo(
        () => shownEntries == null ? null : computeStats(shownEntries, win, page === "who" ? 50 : undefined, measure.steps),
        [shownEntries, win, page, measure]
    );

    const go = (nextSubject: Subject | null, nextPage: Page | null = null) => {
        setSubject(nextSubject);
        setPage(nextPage);
        scrollToTop(root.current);
    };

    const icon = subject == null ? null : subject.type === "trigger"
        ? <TriggerIcon src={subject.iconUrl} size={40} />
        : serverIconUrl(subject.key) && !anonymizeEverything
            ? <TriggerIcon src={serverIconUrl(subject.key)} size={40} />
            : <span className="vc-sora-stats-av big">{anonymizeEverything ? "?" : subject.name[0]?.toUpperCase() ?? "?"}</span>;

    return (
        <div ref={root} style={tabColumn}>
            {viewEntries && view ? (
                <>
                    <div className="vc-sora-stats-crumb">
                        <button type="button" onClick={() => go(null)}>
                            <ChevronLeft />
                            Stats
                        </button>
                        {subject && (
                            <>
                                <span>/</span>
                                {page ? <button type="button" onClick={() => go(subject)}>{subject.name}</button> : <b>{subject.name}</b>}
                            </>
                        )}
                        {page && (
                            <>
                                <span>/</span>
                                <b>{PAGE_LABEL[page]}</b>
                            </>
                        )}
                        <span className="vc-sora-stats-grow" />
                        {page === "timing" && <MeasureMenu measure={measure} onChange={setPickedSteps} />}
                        <TriggerPicker selection={selection} counts={counts} onChange={setSelection} />
                        <PeriodMenu period={period} win={win} onChange={setPeriod} />
                    </div>
                    {page === "timing" ? (
                        <TimingPage
                            entries={shownEntries!}
                            allEntries={viewEntries}
                            stats={view}
                            anonymize={anonymizeEverything}
                            rows={subject ? undefined : shownRows}
                            measure={measure}
                            outcome={outcome}
                            outcomeCounts={outcomeCounts}
                            onOutcome={setOutcome}
                        />
                    ) : page === "who" ? (
                        <WhoPage stats={view} anonymize={anonymizeEverything} />
                    ) : page === "when" ? (
                        <WhenPage entries={viewEntries} stats={view} />
                    ) : subject && (
                        <Detail
                            name={subject.name}
                            icon={icon}
                            stats={view}
                            win={win}
                            anonymize={anonymizeEverything}
                            measure={measure}
                            onTiming={() => go(subject, "timing")}
                            onWho={() => go(subject, "who")}
                            onWhen={() => go(subject, "when")}
                        />
                    )}
                </>
            ) : (
                <>
                    <div className="vc-sora-stats-crumb">
                        <b className="vc-sora-stats-crumb-root">Stats</b>
                        <span className="vc-sora-stats-grow" />
                        <TriggerPicker selection={selection} counts={counts} onChange={setSelection} />
                        <PeriodMenu period={period} win={win} onChange={setPeriod} />
                    </div>
                    <Overview
                        stats={overall}
                        rows={rows}
                        anonymize={anonymizeEverything}
                        onOpen={row => go({ type: "trigger", key: row.name, name: row.name, iconUrl: row.iconUrl })}
                        onOpenServer={(group, label) => go({ type: "server", key: group.key, name: label })}
                        measure={measure}
                        onTiming={() => go(null, "timing")}
                        onWhen={() => go(null, "when")}
                        onWho={() => go(null, "who")}
                    />
                </>
            )}
        </div>
    );
}
