/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./history.css";
import "../../ui/choice.css";
import "../../ui/modal.css";

import { Button } from "@components/Button";
import { CopyIcon, DeleteIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { NavigationRouter, React, showToast, Tooltip } from "@webpack/common";

import { joinUri } from "../../../services/RobloxService";
import { settings } from "../../../settings";
import { SnipeEntry, SnipeLogEntry, SnipeStore, useSnipeEntry } from "../../../stores/SnipeStore";
import { useTourAction } from "../../../stores/TourStore";
import { SnipeTag } from "../../../types";
import { formatElapsedTime } from "../../../utils";
import { TourAnchor, tourAnchor } from "../../tour/TourAnchor";
import { closeAllModals, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "../../ui/LegacyModal";
import Spoiler from "../../ui/Spoiler";
import { COLORS, sectionTitle } from "../../ui/styles";
import { FallbackImage, formatClock, getSnipeStatus } from "./components";
import { PhaseBar, RawView, StoryView, WaterfallView } from "./SnipeTimeline";

// --- Helpers ---

// Marking a verdict replaces only these tags, so real and bait never coexist.
const BIOME_VERDICT_TAGS: SnipeTag[] = [
    "biome-verified-real",
    "biome-verified-bait",
    "biome-verified-timeout",
    "biome-not-verified",
];

const ms = (n: number) => `${Math.round(n)}ms`;

function typeLabel(type: string): string {
    const words = type.toLowerCase().replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function timeAgo(ts: number): string {
    const minutes = Math.floor((Date.now() - ts) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

function logToText(log: SnipeLogEntry[]): string {
    return log.map(l => `${formatClock(l.timestamp, true)} ${l.level.toUpperCase()} ${l.message}`).join("\n");
}

function Hidden({ anonymize, children, block }: { anonymize: boolean; children: React.ReactNode; block?: boolean; }) {
    if (!anonymize) return <>{children}</>;
    return (
        <Spoiler
            style={block ? { display: "block", width: "100%" } : undefined}
            placeholder={block ? <span style={{ fontSize: 13, color: COLORS.muted }}>Hidden by Anonymize snipes. Click to reveal.</span> : undefined}
        >
            {children}
        </Spoiler>
    );
}

const card: React.CSSProperties = { borderRadius: 8, background: "var(--background-mod-subtle)" };

// --- Sections ---

function Timing({ entry }: { entry: SnipeEntry; }) {
    const m = entry.metrics;
    const isReal = entry.tags.includes("biome-verified-real");
    const cells: [string, string, string][] = [
        ["Reaction time", m ? ms(m.timeToJoinMs) : "-", "From the message arriving to Roblox being told to open the server. Loading into the server comes after and isn't counted."],
        ["Plugin", m ? ms(m.overheadMs) : "-", "Part of the reaction time spent by Sol Radar: reading the message, finding the trigger and checking for duplicates."],
        ["Launch", m ? ms(m.openUriDurationMs) : "-", "Part of the reaction time spent by Windows handing the link to Roblox. This depends on your PC, not Sol Radar: a slow disk or CPU, a busy system (macros, emulators, games), antivirus scans and Roblox updates can all make it slower."],
        ...(m?.killDurationMs != null ? [["Macro kill", ms(m.killDurationMs), "Part of the reaction time spent closing your game before joining (Safe join mode)."] as [string, string, string]] : []),
        ["Biome lasted", isReal && entry.biomeDurationMs != null ? formatElapsedTime(entry.biomeDurationMs) : "-", "How long the real biome lasted"],
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))", gap: 6 }}>
            {cells.map(([label, value, tip]) => (
                <Tooltip key={label} text={tip}>
                    {props => (
                        <div {...props} style={{ ...card, display: "flex", flexDirection: "column", gap: 1, padding: "8px 10px" }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                            <span style={{ fontSize: 11, color: COLORS.muted }}>{label}</span>
                        </div>
                    )}
                </Tooltip>
            ))}
        </div>
    );
}

function BiomeVerdict({ entry }: { entry: SnipeEntry; }) {
    // Timed out is there to undo a misclick: it puts back the result the check gave
    const mark = (tag: SnipeTag) => {
        SnipeStore.update(entry.id, { tags: [...entry.tags.filter(t => !BIOME_VERDICT_TAGS.includes(t)), tag] }, { replaceTags: true });
    };

    const option = (tag: SnipeTag, label: string, color: string) => {
        const active = entry.tags.includes(tag);
        return (
            <button
                type="button"
                className="vc-sora-seg"
                aria-pressed={active}
                onClick={() => mark(tag)}
                style={{
                    border: "none",
                    borderRadius: 4,
                    padding: "3px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    ...(active && { color, background: `color-mix(in srgb, ${color} 22%, transparent)` }),
                }}
            >
                {label}
            </button>
        );
    };

    return (
        <div style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px" }}>
            <span style={{ fontSize: 13, color: COLORS.label }}>Was this biome real?</span>
            <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 6, background: "var(--background-mod-strong)" }}>
                {option("biome-verified-real", "✓ Real", COLORS.positive)}
                {option("biome-verified-bait", "✕ Fake", COLORS.danger)}
                {option("biome-verified-timeout", "Timed out", COLORS.warning)}
            </div>
        </div>
    );
}

function Details({ entry, anonymize }: { entry: SnipeEntry; anonymize: boolean; }) {
    const rows: [string, React.ReactNode][] = [
        ...(entry.authorName ? [["Posted by", (
            <Hidden key="a" anonymize={anonymize}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <FallbackImage src={entry.authorAvatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                    {entry.authorName}
                </span>
            </Hidden>
        )] as [string, React.ReactNode]] : []),
        ...(entry.channelName ? [["Channel", <Hidden key="c" anonymize={anonymize}>#{entry.channelName}</Hidden>] as [string, React.ReactNode]] : []),
        ...(entry.guildName ? [["Server", <Hidden key="s" anonymize={anonymize}>{entry.guildName}</Hidden>] as [string, React.ReactNode]] : []),
        ["Type", typeLabel(entry.triggerType)],
        ["Priority", entry.triggerPriority],
        ["Snipe ID", `#${entry.id}`],
    ];

    return (
        <div style={{ ...card, padding: "2px 12px" }}>
            {rows.map(([label, value], i) => (
                <div
                    key={label}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "7px 0",
                        fontSize: 13,
                        borderTop: i === 0 ? "none" : "1px solid var(--background-mod-subtle)",
                    }}
                >
                    <span style={{ color: COLORS.muted, flexShrink: 0 }}>{label}</span>
                    <span style={{ color: COLORS.label, fontWeight: 500, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{value}</span>
                </div>
            ))}
        </div>
    );
}

type View = "timeline" | "waterfall" | "raw";
const VIEWS: [View, string][] = [["timeline", "Timeline"], ["waterfall", "Waterfall"], ["raw", "Raw"]];

function MessageQuote({ entry }: { entry: SnipeEntry; }) {
    if (!entry.processedMessageText) return null;
    return (
        <div style={{ display: "flex", gap: 8, marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "var(--background-mod-subtle)", fontWeight: 400 }}>
            <FallbackImage src={entry.authorAvatarUrl} style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 1 }} />
            <div style={{ minWidth: 0 }}>
                {entry.authorName && <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.label }}>{entry.authorName}</div>}
                <div style={{ fontSize: 13, color: COLORS.text, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{entry.processedMessageText}</div>
            </div>
        </div>
    );
}

function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void; }) {
    return (
        <div style={{ display: "flex", gap: 2, padding: 2, borderRadius: 6, background: "var(--background-mod-strong)" }}>
            {VIEWS.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    className="vc-sora-seg"
                    aria-pressed={view === v}
                    onClick={() => onChange(v)}
                    style={{
                        border: "none",
                        borderRadius: 4,
                        padding: "3px 10px",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        ...(view === v && { color: COLORS.text, background: "var(--background-mod-normal)" }),
                    }}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

// --- Modal ---

function JoinModal({ entry: initialEntry, modalProps }: {
    entry: SnipeEntry;
    modalProps: ModalProps;
}) {
    const entry = useSnipeEntry(initialEntry.id) ?? initialEntry;
    const { anonymizeEverything } = settings.use(["anonymizeEverything"]);
    const [view, setView] = React.useState<View>("timeline");
    useTourAction("details.setView", (v: View) => setView(v));
    const status = getSnipeStatus(entry);
    const isBiomeEntry = entry.tags.some(t => t.startsWith("biome-"));

    const jumpToMessage = () => {
        if (!entry.messageJumpUrl) return;
        try {
            NavigationRouter.transitionTo(new URL(entry.messageJumpUrl).pathname);
            closeAllModals();
        } catch {
            showToast({ text: "Failed to navigate to message.", variant: "critical" });
        }
    };

    const joinServer = () => {
        if (!entry.joinUri) return showToast({ text: "No join link detected.", variant: "critical" });
        try {
            joinUri(entry.joinUri);
            closeAllModals();
        } catch {
            showToast({ text: "Failed to join server.", variant: "critical" });
        }
    };

    const copyLog = () => {
        copyToClipboard(logToText(entry.log));
        showToast({ text: "Log copied!", variant: "success" });
    };

    return (
        <ModalRoot {...modalProps}>
            <ModalHeader className="vc-sora-modal-header vc-sora-modal-header-tall">
                <div {...tourAnchor("details.header")} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                    <FallbackImage src={entry.iconUrl} style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 17, fontWeight: 700, color: COLORS.text }}>{entry.triggerName}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: status.color, background: `color-mix(in srgb, ${status.color} 14%, transparent)` }}>
                                {status.label}
                            </span>
                        </div>
                        <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>
                            {timeAgo(entry.timestamp)} · <Hidden anonymize={anonymizeEverything}>{new Date(entry.timestamp).toLocaleString()}</Hidden>
                        </div>
                    </div>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0 16px" }}>
                    <p style={{ ...sectionTitle, margin: 0 }}>Timing</p>
                    <Timing entry={entry} />
                    <PhaseBar entry={entry} />

                    {isBiomeEntry && <TourAnchor id="details.verdict"><BiomeVerdict entry={entry} /></TourAnchor>}

                    <p style={sectionTitle}>Details</p>
                    <Details entry={entry} anonymize={anonymizeEverything} />

                    <TourAnchor id="details.timeline">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
                        <span style={{ ...sectionTitle, margin: 0 }}>What happened</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <ViewSwitch view={view} onChange={setView} />
                            <Tooltip text="Copy the full log">
                                {props => (
                                    <button
                                        {...props}
                                        type="button"
                                        onClick={copyLog}
                                        aria-label="Copy the full log"
                                        className="vc-sora-history-iconbtn"
                                    >
                                        <CopyIcon width={14} height={14} />
                                    </button>
                                )}
                            </Tooltip>
                        </div>
                    </div>
                    <Hidden anonymize={anonymizeEverything} block>
                        {view === "timeline" ? <StoryView entry={entry} quote={<MessageQuote entry={entry} />} />
                            : view === "waterfall" ? <WaterfallView entry={entry} />
                                : <RawView entry={entry} />}
                    </Hidden>
                    </TourAnchor>
                </div>
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div {...tourAnchor("details.footer")} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                    <Tooltip text="Remove from history">
                        {props => (
                            <Button
                                {...props}
                                size="small"
                                variant="dangerSecondary"
                                aria-label="Remove from history"
                                onClick={() => { SnipeStore.delete(entry.id); modalProps.onClose(); }}
                            >
                                <DeleteIcon width={16} height={16} />
                            </Button>
                        )}
                    </Tooltip>
                    <span style={{ flex: 1 }} />
                    {entry.messageJumpUrl && <Button size="small" variant="secondary" onClick={jumpToMessage}>Go to message</Button>}
                    {entry.link && (
                        <Button size="small" variant="secondary" onClick={() => { copyToClipboard(entry.link!); showToast({ text: "Copied!", variant: "success" }); }}>
                            Copy link
                        </Button>
                    )}
                    {entry.joinUri && <Button size="small" variant="primary" onClick={joinServer}>Join</Button>}
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

// --- Entrypoint ---

export function openJoinModal(entry: SnipeEntry): string {
    return openModal(p => <JoinModal entry={entry} modalProps={p} />);
}
