/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./debug/debug.css";
import "./choice.css";
import "./modal.css";

import { CopyIcon, LinkIcon, OpenExternalIcon, PencilIcon, SafetyIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { Channel, Guild, Message } from "@vencord/discord-types";
import { React, showToast, Tooltip } from "@webpack/common";

import { isComponentsV2 } from "../../services/MessageProcessor";
import { joinLink, lookupPlaceId } from "../../services/RobloxService";
import { settings } from "../../settings";
import { UIState } from "../../stores/UIStateStore";
import { SnipableLink } from "../../types";
import { parseCsv } from "../../utils";
import { openEditTriggerModal } from "../tabs/triggers/editor/TriggerEditor";
import { ALL_STEPS, analyzeMessage, debugReport, DebugResult, DebugStep, Fix, GROUPS, StepStatus, Verdict } from "./debug/analyzeMessage";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "./LegacyModal";

type View = "checklist" | "trace";

// --- Icons ---

// Built on render, never at module load: Discord's React isn't ready when plugins load
function statusPath(status: StepStatus) {
    switch (status) {
        case "pass": return <path d="M3 8.5l3 3 7-7" />;
        case "fail": return <path d="M4 4l8 8M12 4l-8 8" />;
        case "warn": return <><path d="M8 4v5" /><path d="M8 11.8v.1" /></>;
        case "info": return <><path d="M8 7.5v4" /><path d="M8 4.6v.1" /></>;
        case "skip": return <path d="M4.5 8h7" />;
    }
}

function StatusIcon({ status, size = 11 }: { status: StepStatus; size?: number; }) {
    return (
        <span className={`vc-sora-dbg-ic ${status}`}>
            <svg viewBox="0 0 16 16" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {statusPath(status)}
            </svg>
        </span>
    );
}

const VERDICT_ICON: Record<Verdict, StepStatus> = { join: "pass", saved: "warn", ignored: "skip" };

// --- Pieces ---

/** Icon button that turns into a green check for a moment once its action succeeds. */
function IconButton({ tip, doneTip, onClick, children }: { tip: string; doneTip: string; onClick: () => Promise<boolean>; children: React.ReactNode; }) {
    const [done, setDone] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    React.useEffect(() => () => clearTimeout(timer.current), []);

    const click = async () => {
        if (!await onClick()) return;
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1500);
    };

    return (
        <Tooltip text={done ? doneTip : tip} forceOpen={done || undefined}>
            {props => (
                <button {...props} type="button" className={`vc-sora-dbg-ibtn${done ? " done" : ""}`} aria-label={done ? doneTip : tip} onClick={click}>
                    {done ? <StatusIcon status="pass" size={14} /> : children}
                </button>
            )}
        </Tooltip>
    );
}

function Verdict({ result }: { result: DebugResult; }) {
    return (
        <div className={`vc-sora-dbg-verdict ${result.verdict}`}>
            <span className="vc-sora-dbg-verdict-icon"><StatusIcon status={VERDICT_ICON[result.verdict]} size={14} /></span>
            <div>
                <b>{result.title}</b>
                <span>{result.detail}</span>
            </div>
        </div>
    );
}

function FixButtons({ fixes, onFixed }: { fixes?: Fix[]; onFixed: () => void; }) {
    if (!fixes?.length) return null;
    return (
        <div className="vc-sora-dbg-fixes">
            {fixes.map(f => (
                <button
                    key={f.label}
                    type="button"
                    className="vc-sora-dbg-fix"
                    onClick={async () => {
                        await f.run();
                        showToast({ text: `${f.label}: done`, variant: "success" });
                        onFixed();
                    }}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );
}

type CheckState =
    | { state: "idle"; }
    | { state: "loading"; }
    | { state: "done"; tone: "ok" | "bad" | "na"; text: string; /** Raw error, shown on hover */ error?: string; };

/** A readable reason for a failed lookup. The raw error goes in the tooltip. */
function lookupFailure(status: number | undefined): string {
    if (status === 401 || status === 403) return "Roblox rejected your token. It may have expired.";
    if (status === 400 || status === 404) return "Roblox says this link doesn't exist.";
    if (status === 429) return "Roblox is rate limiting you. Try again in a minute.";
    if (status === -1) return "Couldn't reach Roblox.";
    return "Roblox couldn't resolve this link. It may be expired or invalid.";
}

/** Asks Roblox which place a link opens. One request, only when clicked. Never runs the bad link action. */
async function checkLink(link: SnipableLink): Promise<Extract<CheckState, { state: "done"; }>> {
    if (link.type === "joinguard") return { state: "done", tone: "na", text: "Joinguard links can't be checked." };
    if (link.type === "share" && !settings.store.robloxToken) return { state: "done", tone: "na", text: "Needs your Roblox token (Settings, Link verification)." };

    const res = await lookupPlaceId(link);
    if (!res.ok) return { state: "done", tone: "bad", text: lookupFailure(res.status), error: `${res.status != null ? `HTTP ${res.status}: ` : ""}${res.error}`.slice(0, 400) };
    const { placeId } = res;

    const allowed = parseCsv(settings.store.allowedPlaceIds);
    if (allowed.size === 0) return { state: "done", tone: "ok", text: `Place ${placeId}. Your allowed list is empty, so any place passes.` };
    return allowed.has(String(placeId))
        ? { state: "done", tone: "ok", text: `Place ${placeId}, in your allowed list.` }
        : { state: "done", tone: "bad", text: `Place ${placeId}, not in your allowed list.` };
}

function placeIdTip(link: SnipableLink): string {
    if (link.type === "joinguard") return "Joinguard links can't be checked.";
    if (link.type === "private") return "Shows which game this private server link opens.";
    return settings.store.robloxToken
        ? "Asks Roblox which game this link opens."
        : "Asks Roblox which game this link opens. Needs a Roblox token, set in Settings under Link verification.";
}

function useLinkCheck(link: SnipableLink | null) {
    const [check, setCheck] = React.useState<CheckState>({ state: "idle" });
    const run = async () => {
        if (!link) return;
        setCheck({ state: "loading" });
        try {
            setCheck(await checkLink(link));
        } catch (err) {
            setCheck({ state: "done", tone: "bad", text: "Couldn't reach Roblox. Try again later.", error: String(err) });
        }
    };
    return { check, run };
}

function LinkCheckResult({ check }: { check: CheckState; }) {
    if (check.state === "idle") return null;
    if (check.state === "loading") return <span className="vc-sora-dbg-lres"><span className="vc-sora-dbg-spin" /> Asking Roblox…</span>;
    return (
        <Tooltip text={check.error ?? check.text} shouldShow={!!check.error}>
            {props => (
                <span {...props} className={`vc-sora-dbg-lres ${check.tone}${check.error ? " has-error" : ""}`}>
                    <StatusIcon status={check.tone === "ok" ? "pass" : check.tone === "bad" ? "fail" : "info"} size={10} />
                    {check.text}
                </span>
            )}
        </Tooltip>
    );
}

/** Shows URLs in link blue, like Discord does. Only for looks: nothing is clickable. */
function Linkified({ text }: { text: string; }) {
    const parts = text.split(/(https?:\/\/[^\s<]+)/g);
    return <>{parts.map((part, i) => i % 2 ? <span key={i} className="vc-sora-dbg-link">{part}</span> : part)}</>;
}

/** `text` is what Sol Radar reads: the message text plus any embed or component text and links. */
function MessagePreview({ message, channel, guild, text }: { message: Message; channel: Channel; guild: Guild; text: string; }) {
    const author = message.author as any;
    const avatar: string | undefined = author?.getAvatarURL?.(undefined, 40);
    const when = new Date(message.timestamp as any);
    const hasComponents = (message.components?.length ?? 0) > 0 && isComponentsV2(message);
    const embeds = message.embeds.length;

    // Not a copy of the real message: a note says what kind of rich content it has
    const note = hasComponents
        ? "Built with text blocks and buttons. Shown the way Sol Radar reads it."
        : embeds
            ? `Has ${embeds === 1 ? "an embed" : `${embeds} embeds`}. Shown the way Sol Radar reads ${embeds === 1 ? "it" : "them"}.`
            : null;

    return (
        <div className="vc-sora-dbg-msg">
            {avatar ? <img className="vc-sora-dbg-msg-avatar" src={avatar} alt="" /> : <span className="vc-sora-dbg-msg-avatar" />}
            <div className="vc-sora-dbg-msg-body">
                <div className="vc-sora-dbg-msg-who">
                    <span className="vc-sora-dbg-msg-name">{author?.globalName || author?.username || "Unknown"}</span>
                    {author?.bot && <span className="vc-sora-dbg-app">App</span>}
                    <span className="vc-sora-dbg-msg-time">{isNaN(+when) ? "" : when.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="vc-sora-dbg-msg-where">#{channel.name} · {guild.name}</span>
                </div>
                {text.trim() && <div className="vc-sora-dbg-msg-text"><Linkified text={text.trim().slice(0, 500)} /></div>}
                {note && <div className="vc-sora-dbg-msg-note"><StatusIcon status="warn" size={10} />{note}</div>}
            </div>
        </div>
    );
}

/** The analysis steps plus "Not reached" for the ones it never got to. */
function fullSteps(result: DebugResult): DebugStep[] {
    return ALL_STEPS.map(([group, name]) =>
        result.steps.find(s => s.group === group && s.name === name)
        ?? { group, name, status: "skip" as const, detail: "Not reached." }
    );
}

// --- Views ---

function ChecklistView({ result, onFixed }: { result: DebugResult; onFixed: () => void; }) {
    const steps = fullSteps(result);

    return (
        <>
            {GROUPS.map(([key, name]) => {
                const items = steps.filter(s => s.group === key);
                const tag = items.some(s => s.status === "fail") ? "stopped here" : items.every(s => s.status === "skip") ? "not reached" : "";
                const row = (s: DebugStep) => (
                    <div key={s.name} className={`vc-sora-dbg-step ${s.status}`}>
                        <StatusIcon status={s.status} />
                        <div>
                            <b>{s.name}</b>
                            {s.detail && <span>{s.detail}</span>}
                            <FixButtons fixes={s.fixes} onFixed={onFixed} />
                        </div>
                    </div>
                );

                return (
                    <React.Fragment key={key}>
                        {/* A snipe is saved to History once a trigger matches and nothing blocks it */}
                        {key === "join" && (
                            <div className={`vc-sora-dbg-milestone${result.reachedHistory ? " reached" : ""}`}>
                                {result.reachedHistory ? "A snipe is saved to History here" : "A snipe would be saved to History here"}
                            </div>
                        )}
                        <div className="vc-sora-dbg-group">
                            <div className="vc-sora-dbg-group-head"><span>{name}</span><em>{tag}</em></div>
                            <div className="vc-sora-dbg-steps">{items.map(row)}</div>
                        </div>
                    </React.Fragment>
                );
            })}
        </>
    );
}

const TRACE_MARK: Record<StepStatus, string> = { pass: "✓", fail: "✕", warn: "!", info: "i", skip: "·" };

function TraceView({ result, onFixed }: { result: DebugResult; onFixed: () => void; }) {
    const steps = fullSteps(result);
    const fixes = result.steps.flatMap(s => s.fixes ?? []);

    return (
        <>
            <FixButtons fixes={fixes} onFixed={onFixed} />
            <div className="vc-sora-dbg-sec">Trace</div>
            <div className="vc-sora-dbg-trace vc-sora-thin-scroll">
                {steps.map(s => (
                    <React.Fragment key={s.name}>
                        <div className={`vc-sora-dbg-tr ${s.status}`}>
                            <span className="mark">{TRACE_MARK[s.status]}</span>
                            <span className="name">{s.name}</span>
                            <span className="detail">{s.detail ?? "ok"}</span>
                        </div>
                        {s.name === "Join lock" && (
                            <div className={`vc-sora-dbg-tr-mark${result.reachedHistory ? " reached" : ""}`}>
                                {result.reachedHistory ? "saved to History" : "would be saved to History here"}
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </>
    );
}

// --- Modal ---

function DebugModal({ modalProps, message, channel, guild }: { modalProps: ModalProps; message: Message; channel: Channel; guild: Guild; }) {
    const [view, setView] = React.useState<View>(UIState.get("debugView"));
    // Bumped after a fix button changes a setting, so the analysis runs again
    const [version, setVersion] = React.useState(0);
    const result = React.useMemo(() => analyzeMessage(message, channel, guild), [version]);
    const rerun = () => setVersion(v => v + 1);
    const linkCheck = useLinkCheck(result.link);

    const switchView = (v: View) => {
        setView(v);
        UIState.set("debugView", v);
    };

    // Success shows on the button itself; only a failure needs a toast
    // On desktop copyToClipboard may not return a promise, so await it instead of chaining .then
    const copy = async (text: string, what: string) => {
        try {
            await copyToClipboard(text);
            return true;
        } catch {
            showToast({ text: `Couldn't copy the ${what.toLowerCase()}`, variant: "critical" });
            return false;
        }
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="vc-sora-modal-header">
                <div className="vc-sora-dbg-head">
                    <span className="vc-sora-dbg-title">Snipe Debug</span>
                    <div className="vc-sora-dbg-switch" role="group" aria-label="Layout">
                        {(["checklist", "trace"] as const).map(v => (
                            <button key={v} type="button" className="vc-sora-seg" aria-pressed={view === v} onClick={() => switchView(v)}>
                                {v === "checklist" ? "Checklist" : "Trace"}
                            </button>
                        ))}
                    </div>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent className="vc-sora-dbg-content">
                <Verdict result={result} />
                <MessagePreview message={message} channel={channel} guild={guild} text={result.interpretedContent} />
                {view === "checklist"
                    ? <ChecklistView result={result} onFixed={rerun} />
                    : <TraceView result={result} onFixed={rerun} />}
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div className="vc-sora-dbg-foot">
                    {linkCheck.check.state !== "idle" && <div className="vc-sora-dbg-foot-result"><LinkCheckResult check={linkCheck.check} /></div>}
                    <IconButton tip="Copy a report to paste when asking for help" doneTip="Report copied" onClick={() => copy(debugReport(result, message, channel, guild), "Report")}>
                        <CopyIcon width={18} height={18} />
                    </IconButton>
                    {result.link && (
                        <IconButton tip="Copy the server link" doneTip="Link copied" onClick={() => copy(result.link!.link, "Link")}>
                            <LinkIcon width={18} height={18} />
                        </IconButton>
                    )}
                    {result.link && (
                        <Tooltip text={placeIdTip(result.link)}>
                            {props => (
                                <button {...props} type="button" className="vc-sora-dbg-fbtn" disabled={linkCheck.check.state !== "idle"} onClick={linkCheck.run}>
                                    <SafetyIcon width={16} height={16} />
                                    Check Roblox PlaceID
                                </button>
                            )}
                        </Tooltip>
                    )}
                    {result.link && result.verdict !== "join" && (
                        <Tooltip text="Opens this server in Roblox now, skipping every check.">
                            {props => (
                                <button {...props} type="button" className="vc-sora-dbg-fbtn" onClick={() => { void joinLink(result.link!); modalProps.onClose(); }}>
                                    <OpenExternalIcon width={16} height={16} />
                                    Join
                                </button>
                            )}
                        </Tooltip>
                    )}
                    <span style={{ flex: 1 }} />
                    {result.trigger && (
                        <button type="button" className="vc-sora-dbg-fbtn primary" onClick={() => openEditTriggerModal(result.trigger!)}>
                            <PencilIcon width={16} height={16} />
                            Edit {result.trigger.name}
                        </button>
                    )}
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

// --- Entry point ---

export function openMessageDebugModal(message: Message, channel: Channel, guild: Guild) {
    openModal(props => <DebugModal modalProps={props} message={message} channel={channel} guild={guild} />);
}
