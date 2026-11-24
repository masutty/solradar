/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";

import { SnipeEntry } from "../../../stores/SnipeStore";
import { jumpToMessage, openSnipeContextMenu } from "../recentJoins/SnipeContextMenu";
import { fmtSeconds, kindOf, Measure, RESULT_LABEL, timingOf } from "./data";
import { Avatar, RESULT_COLOR, TimeAgo, TriggerIcon } from "./parts";

export function ResultLabel({ entry }: { entry: SnipeEntry; }) {
    const kind = kindOf(entry);
    if (kind === "real" || kind === "bait" || kind === "timeout" || kind === "unverified") {
        return <span className="vc-sora-stats-res"><i style={{ background: RESULT_COLOR[kind] }} />{RESULT_LABEL[kind]}</span>;
    }
    return <span className="vc-sora-stats-res"><i style={{ background: "var(--text-muted)" }} />{kind === "failed" ? "Failed" : kind === "ignored" ? "Ignored" : "Other"}</span>;
}

const channelOf = (e: SnipeEntry) => e.channelName ? `#${e.channelName.replace(/^#/, "")}` : null;

// Avatar and channel in the row, everything else in the tooltip
function SnipeOrigin({ entry, anonymize }: { entry: SnipeEntry; anonymize: boolean; }) {
    const author = anonymize ? "Hidden" : entry.authorName ?? "Unknown";
    const channel = anonymize ? null : channelOf(entry);
    const card = (
        <div className="vc-sora-stats-origin-tip">
            <Avatar src={entry.authorAvatarUrl} name={author} anonymize={anonymize} />
            <div>
                <b>{author}</b>
                {channel && <span>{channel}</span>}
                {!anonymize && entry.guildName && <span>{entry.guildName}</span>}
            </div>
        </div>
    );
    return (
        <Tooltip text={card}>
            {props => (
                <span {...props} className="vc-sora-stats-origin">
                    <Avatar src={entry.authorAvatarUrl} name={author} anonymize={anonymize} />
                    <span>{channel ?? author}</span>
                </span>
            )}
        </Tooltip>
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
    // A trigger column only helps when the list mixes triggers
    const showTrigger = new Set(entries.map(e => e.triggerName)).size > 1;
    return (
        <div className="vc-sora-stats-table">
            <div className={`vc-sora-stats-rec head${showTrigger ? " trig" : ""}`}>
                <span>When</span>
                <span>Snipe</span>
                {showTrigger && <span>Trigger</span>}
                <span>Result</span>
                <span>Time</span>
            </div>
            {entries.map(e => {
                const ms = time ? time(e) : timingOf(e, measure.steps);
                const jump = e.messageJumpUrl ? () => jumpToMessage(e) : undefined;
                return (
                    <div
                        key={e.id}
                        className={`vc-sora-stats-rec${jump ? " link" : ""}${showTrigger ? " trig" : ""}`}
                        role={jump ? "button" : undefined}
                        tabIndex={jump ? 0 : undefined}
                        onClick={jump}
                        onKeyDown={jump && (k => { if (k.key === "Enter") jump(); })}
                        onContextMenu={ev => openSnipeContextMenu(ev, e)}
                    >
                        <TimeAgo className="vc-sora-stats-rec-t" ts={e.timestamp} anonymize={anonymize} />
                        <SnipeOrigin entry={e} anonymize={anonymize} />
                        {showTrigger && (
                            <Tooltip text={e.triggerName}>
                                {props => (
                                    <span {...props} className="vc-sora-stats-rec-trig">
                                        <TriggerIcon src={e.iconUrl} size={16} />
                                        <span>{e.triggerName}</span>
                                    </span>
                                )}
                            </Tooltip>
                        )}
                        <ResultLabel entry={e} />
                        <span className="vc-sora-stats-rec-ms">{fmtSeconds(ms)}</span>
                    </div>
                );
            })}
        </div>
    );
}
