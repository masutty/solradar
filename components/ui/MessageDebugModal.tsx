/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./debug/debug.css";
import "./choice.css";
import "./modal.css";

import { Button } from "@components/Button";
import { CopyIcon, LinkIcon, OpenExternalIcon, PencilIcon, SafetyIcon } from "@components/Icons";
import { copyToClipboard } from "@utils/clipboard";
import { Channel, Guild, Message } from "@vencord/discord-types";
import { React, showToast, Tooltip } from "@webpack/common";

import { isComponentsV2 } from "../../services/MessageProcessor";
import { joinLink, lookupPlaceId, resolveShareLinkRaw } from "../../services/RobloxService";
import { settings } from "../../settings";
import { TYPE_COLORS } from "../../stores/TriggerStore";
import { UIState } from "../../stores/UIStateStore";
import { SnipableLink } from "../../types";
import { isDeveloper, parseCsv } from "../../utils";
import { openEditTriggerModal } from "../tabs/triggers/editor/TriggerEditor";
import { ALL_STEPS, analyzeMessage, debugReport, DebugResult, DebugStep, Fix, GROUPS, LeftOutGroup, LeftOutKind, StepStatus, Verdict } from "./debug/analyzeMessage";
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
                <Button {...props} size="small" variant="secondary" style={{ minWidth: 30, width: 30, padding: 0 }} aria-label={done ? doneTip : tip} onClick={click}>
                    {done ? <StatusIcon status="pass" size={14} /> : children}
                </Button>
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
                <Button
                    key={f.label}
                    size="xs"
                    variant="secondary"
                    onClick={async () => {
                        await f.run();
                        showToast({ text: `${f.label}: done`, variant: "success" });
                        onFixed();
                    }}
                >
                    {f.label}
                </Button>
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

// --- Left out by a filter ---

const TONE_COLOR = { global: "var(--status-danger)", folder: "", own: "var(--text-muted)" };

// Built on render, never at module load, like the status icons
function KindIcon({ kind }: { kind: LeftOutKind; }) {
    const line = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
    const svg = (children: React.ReactNode, props: object = line) => <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>{children}</svg>;
    switch (kind) {
        case "server": return svg(<><rect x="3" y="4" width="18" height="16" rx="5" /><path d="M5 19 19 5" /></>);
        case "channel": return svg(<path d="M10 4 7 20M17 4l-3 16M4 9h16M3 15h16" />);
        case "monitor": return svg(<><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3 3.9M6.6 6.6C3.9 8.4 2.5 12 2.5 12S6 19 12 19c1.9 0 3.5-.6 4.9-1.5" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>);
        case "userx": return svg(<><circle cx="10" cy="8" r="4" /><path d="M3 20c1.4-3.8 4-5.8 7-5.8 1.2 0 2.3.3 3.3.9M16 15l5 5M21 15l-5 5" /></>);
        case "word": return svg(<><path d="M3 18 7.5 6 12 18M4.7 14h5.6" /><path d="M15 18v-6.5a2.5 2.5 0 0 1 5 0V18M15 15h5" /><path d="M2 21 22 3" strokeWidth={1.8} /></>);
        case "folder": return svg(<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h4l2 2.5h7A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />, { fill: "currentColor" });
        case "user": return svg(<><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>);
    }
}

function LeftOutTip({ title, dot, body, list, source }: { title: string; dot?: string; body?: string; list?: string[]; source: string; }) {
    return (
        <div className="vc-sora-dbg-tip">
            <b>{dot && <i style={{ background: dot }} />}{title}</b>
            {body && <span>{body}</span>}
            {list && <div className="vc-sora-dbg-tip-list">{list.map(n => <span key={n}>{n}</span>)}</div>}
            <em>{source}</em>
        </div>
    );
}

function LeftOutRows({ groups }: { groups: LeftOutGroup[]; }) {
    const total = groups.reduce((n, g) => n + g.triggers.length, 0);
    return (
        <>
            <span>{total === 1 ? "1 trigger matched the words but was left out." : `${total} triggers matched the words but were left out.`}</span>
            <div className="vc-sora-dbg-lo">
                {groups.map(g => (
                    <React.Fragment key={`${g.source}|${g.short}|${g.reason}`}>
                        <Tooltip text={<LeftOutTip title={g.short} body={g.reason} source={g.source} />}>
                            {props => (
                                <span {...props} className="vc-sora-dbg-lo-tag" style={{ "--tc": g.tone === "folder" ? g.folderColor : TONE_COLOR[g.tone] } as React.CSSProperties}>
                                    <KindIcon kind={g.kind} />
                                </span>
                            )}
                        </Tooltip>
                        <div className="vc-sora-dbg-lo-chips">
                            {g.byUser
                                ? (
                                    <Tooltip text={<LeftOutTip title="Only fire for other users" list={g.triggers.map(t => t.name)} source={g.source} />}>
                                        {props => (
                                            <span {...props} className="vc-sora-dbg-chip muted">
                                                <KindIcon kind="user" />
                                                <span>{g.triggers.length} {g.triggers.length === 1 ? "trigger" : "triggers"}</span>
                                            </span>
                                        )}
                                    </Tooltip>
                                )
                                : g.triggers.map(t => (
                                    <Tooltip key={t.id} text={<LeftOutTip title={t.name} dot={TYPE_COLORS[t.type]} body={g.reason} source={g.source} />}>
                                        {props => (
                                            <span {...props} className="vc-sora-dbg-chip">
                                                <i style={{ background: TYPE_COLORS[t.type] }} />
                                                <span>{t.name}</span>
                                            </span>
                                        )}
                                    </Tooltip>
                                ))}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </>
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
                            {s.leftOut ? <LeftOutRows groups={s.leftOut} /> : s.detail && <span>{s.detail}</span>}
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

/** Developer only: what Roblox answers when the share code is resolved, untouched. */
function RawResolveModal({ modalProps, code }: { modalProps: ModalProps; code: string; }) {
    const [text, setText] = React.useState<string | null>(null);
    const [ids, setIds] = React.useState<{ ownerId?: string; placeId?: string; }>({});

    React.useEffect(() => {
        resolveShareLinkRaw(code).then(res => {
            if (!res.ok) return setText(`Request failed (${res.status}): ${res.error}`);
            const { body: rawBody } = res;
            let body: any = rawBody;
            try { body = JSON.parse(rawBody); } catch { /* not JSON, show as is */ }
            const data = body?.privateServerInviteData;
            setIds({ ownerId: data?.ownerUserId?.toString(), placeId: data?.placeId?.toString() });
            setText(JSON.stringify({ status: res.status, statusText: res.statusText, headers: res.headers, body }, null, 2));
        }, err => setText(String(err)));
    }, []);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="vc-sora-modal-header">
                <div className="vc-sora-dbg-head">
                    <span className="vc-sora-dbg-title">Raw resolve</span>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>
            <ModalContent className="vc-sora-dbg-content">
                <pre className="vc-sora-dbg-raw vc-sora-thin-scroll">{text ?? "Asking Roblox…"}</pre>
            </ModalContent>
            <ModalFooter className="vc-sora-modal-footer">
                <div className="vc-sora-dbg-foot">
                    {ids.ownerId && (
                        <Button size="small" variant="secondary" style={{ gap: 6 }} onClick={() => window.open(`https://www.roblox.com/users/${ids.ownerId}/profile`, "_blank")}>
                            <OpenExternalIcon width={16} height={16} />
                            Owner profile
                        </Button>
                    )}
                    {ids.placeId && (
                        <Button size="small" variant="secondary" style={{ gap: 6 }} onClick={() => window.open(`https://www.roblox.com/games/${ids.placeId}`, "_blank")}>
                            <OpenExternalIcon width={16} height={16} />
                            Game page
                        </Button>
                    )}
                    <span style={{ flex: 1 }} />
                    <Button size="small" variant="secondary" disabled={text == null} onClick={() => copyToClipboard(text!)}>Copy</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
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
                                <Button {...props} size="small" variant="secondary" style={{ gap: 6 }} disabled={linkCheck.check.state !== "idle"} onClick={linkCheck.run}>
                                    <SafetyIcon width={16} height={16} />
                                    Check Roblox PlaceID
                                </Button>
                            )}
                        </Tooltip>
                    )}
                    {isDeveloper() && result.link?.type === "share" && (
                        <Button size="small" variant="secondary" onClick={() => openModal(props => <RawResolveModal modalProps={props} code={result.link!.code} />)}>
                            Raw resolve
                        </Button>
                    )}
                    {result.link && result.verdict !== "join" && (
                        <Tooltip text="Opens this server in Roblox now, skipping every check.">
                            {props => (
                                <Button {...props} size="small" variant="secondary" style={{ gap: 6 }} onClick={() => { void joinLink(result.link!); modalProps.onClose(); }}>
                                    <OpenExternalIcon width={16} height={16} />
                                    Join
                                </Button>
                            )}
                        </Tooltip>
                    )}
                    <span style={{ flex: 1 }} />
                    {result.trigger && (
                        <Button size="small" variant="primary" style={{ gap: 6 }} onClick={() => openEditTriggerModal(result.trigger!)}>
                            <PencilIcon width={16} height={16} />
                            Edit {result.trigger.name}
                        </Button>
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
