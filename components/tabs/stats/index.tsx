/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./stats.css";

import { React } from "@webpack/common";

import { settings } from "../../../settings";
import { useSnipeHistory } from "../../../stores/SnipeStore";
import { tabColumn } from "../../ui/styles";
import { computeStats, measureOf, Period, serverKey, triggerRows, windowOf } from "./data";
import { Detail } from "./Detail";
import { Overview } from "./Overview";
import { TimingPage, WhenPage, WhoPage } from "./Pages";
import { serverIconUrl, TriggerIcon } from "./parts";
import { MeasureMenu, PeriodMenu } from "./PeriodMenu";

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
    const rows = React.useMemo(() => triggerRows(inWindow, win, measure.steps), [inWindow, win, measure]);
    const overall = React.useMemo(() => computeStats(inWindow, win, undefined, measure.steps), [inWindow, win, measure]);
    // What the page below the overview looks at: one trigger or server, or every snipe when a page is open without one
    const viewEntries = React.useMemo(
        () => subject != null
            ? inWindow.filter(e => subject.type === "trigger" ? e.triggerName === subject.key : serverKey(e) === subject.key)
            : page ? inWindow : null,
        [inWindow, subject, page]
    );
    const view = React.useMemo(
        () => viewEntries == null ? null : computeStats(viewEntries, win, page === "who" ? 50 : undefined, measure.steps),
        [viewEntries, win, page, measure]
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
                        <PeriodMenu period={period} win={win} onChange={setPeriod} />
                    </div>
                    {page === "timing" ? (
                        <TimingPage entries={viewEntries} stats={view} anonymize={anonymizeEverything} rows={subject ? undefined : rows} measure={measure} />
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
