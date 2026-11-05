/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./forwardEditor.css";

import { Switch } from "@components/Switch";
import { React, ReactDOM, Select, Tooltip, UserStore } from "@webpack/common";

import { buildForwardPayload, CARD_LAYOUTS, EMBED_USES, ForwardKind } from "../../../../services/forwardMessage";
import { resolveIcon } from "../../../../stores/IconStore";
import { CardLayout, ForwardFormat, ForwardShow, hasBiomeCheck, hasBiomeStatus, TYPE_COLORS } from "../../../../stores/TriggerStore";
import { descriptionText, labelText } from "../../../ui/styles";
import { rowStacked } from "./fields";
import type { Draft, Patch } from "./sections";

// --- Pick-one buttons ---

export function ChoiceTiles<T extends string>({ value, options, onChange, columns = options.length, extra }: {
    value: T;
    options: { value: T; label: string; disabled?: boolean; /** Why it is disabled, shown on hover */ reason?: string; }[];
    onChange: (v: T) => void;
    columns?: number;
    /** One more cell at the end of the row, for a control that belongs with the choices */
    extra?: React.ReactNode;
}) {
    return (
        <div className="vc-sora-typegrid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="group">
            {options.map(o => {
                const button = (
                    <button type="button" className="vc-sora-typeopt" aria-pressed={value === o.value} disabled={o.disabled} onClick={() => onChange(o.value)}>
                        {o.label}
                    </button>
                );
                if (!o.disabled || !o.reason) return React.cloneElement(button, { key: o.value });
                // A disabled button gets no hover events, so the tooltip sits on a wrapper
                return (
                    <Tooltip key={o.value} text={o.reason}>
                        {props => <div {...props} className="vc-sora-disabled-wrap">{button}</div>}
                    </Tooltip>
                );
            })}
            {extra}
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode; }) {
    return (
        <div style={rowStacked}>
            <span style={labelText}>{label}</span>
            {hint && <span style={descriptionText}>{hint}</span>}
            {children}
        </div>
    );
}

// --- Fields ---

type MatchMode = "off" | "late" | "early";

const MATCH_OPTIONS: { label: string; value: MatchMode; }[] = [
    { label: "Off", value: "off" },
    { label: "After joining", value: "late" },
    { label: "As soon as possible, before joining", value: "early" },
];

export function MatchTimingField({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const f = draft.forwarding;
    const mode: MatchMode = !f.onMatch.enabled ? "off" : f.onMatch.early ? "early" : "late";
    return (
        <Field label="Forward on match" hint="When to send the message after a match. Sending it first can slightly slow the join.">
            <Select
                options={MATCH_OPTIONS}
                maxVisibleItems={3}
                closeOnSelect={true}
                select={(v: MatchMode) => patch({ forwarding: { ...f, onMatch: { enabled: v !== "off", early: v === "early" } } })}
                isSelected={(v: MatchMode) => v === mode}
                serialize={(v: MatchMode) => v}
            />
        </Field>
    );
}

export function FormatFields({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const f = draft.forwarding;
    const patchF = (p: Partial<typeof f>) => patch({ forwarding: { ...f, ...p } });
    const layouts = Object.entries(CARD_LAYOUTS) as [CardLayout, typeof CARD_LAYOUTS[CardLayout]][];
    return (
        <>
            <Field label="Message format" hint={f.format === "card" ? "A card made of components. It has buttons, and can't be mixed with an embed." : "The classic embed. It has no buttons."}>
                <ChoiceTiles<ForwardFormat>
                    value={f.format}
                    options={[{ value: "card", label: "Card" }, { value: "embed", label: "Embed" }]}
                    onChange={format => patchF({ format })}
                />
            </Field>
            {f.format === "card" && (
                <Field label="Card layout" hint={CARD_LAYOUTS[f.layout].description}>
                    <ChoiceTiles<CardLayout>
                        value={f.layout}
                        options={layouts.map(([value, l]) => ({ value, label: l.name }))}
                        onChange={layout => patchF({ layout })}
                        columns={3}
                    />
                </Field>
            )}
        </>
    );
}

export function AccentField({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const f = draft.forwarding;
    const typeColor = TYPE_COLORS[draft.type];
    const custom = f.accentColor !== "";
    const picker = React.useRef<HTMLInputElement>(null);
    const patchF = (p: Partial<typeof f>) => patch({ forwarding: { ...f, ...p } });
    return (
        <Field
            label="Accent color"
            hint={`The stripe on the left of the message.${hasBiomeStatus(draft) ? " Messages sent when the biome is confirmed are always green." : ""}`}
        >
            <ChoiceTiles<"type" | "custom">
                value={custom ? "custom" : "type"}
                options={[{ value: "type", label: "Trigger type color" }, { value: "custom", label: "Custom" }]}
                onChange={v => patchF({ accentColor: v === "custom" ? typeColor : "" })}
                columns={custom ? 3 : 2}
                extra={custom && (
                    <button type="button" className="vc-sora-typeopt vc-sora-fcolor" aria-label="Pick a color" onClick={() => picker.current?.click()}>
                        <span style={{ background: f.accentColor }} />
                        {f.accentColor.toUpperCase()}
                        <input ref={picker} type="color" tabIndex={-1} value={f.accentColor} onChange={e => patchF({ accentColor: e.target.value })} />
                    </button>
                )}
            />
        </Field>
    );
}

const SHOW_LABELS: [keyof ForwardShow, string][] = [
    ["icon", "Trigger icon"],
    ["time", "When it was sent"],
    ["sender", "Who sent it"],
    ["where", "Where it was sent"],
    ["biome", "Biome status"],
    ["message", "User message"],
    ["join", "Join Server button"],
    ["jump", "Jump to Message button"],
];

/** Why a part of the message cannot be turned on for this trigger, or null when it can */
function unavailableReason(key: keyof ForwardShow, draft: Draft): string | null {
    const f = draft.forwarding;
    if (key === "biome" && !hasBiomeStatus(draft)) {
        return hasBiomeCheck(draft.type)
            ? "This trigger has no biome detection set up, so there is no status to show."
            : "This trigger has no biome, so there is no status to show.";
    }
    if (f.format === "card") {
        return CARD_LAYOUTS[f.layout].uses.includes(key) ? null : `The ${CARD_LAYOUTS[f.layout].name} layout doesn't show this.`;
    }
    if (EMBED_USES.includes(key)) return null;
    return key === "message" ? "Embeds don't show what the sender wrote." : "Embeds can't have buttons.";
}

export function ShowFields({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const f = draft.forwarding;
    const uses = f.format === "card" ? CARD_LAYOUTS[f.layout].uses : EMBED_USES;
    return (
        <Field label="Show in the message" hint="Turn off what you don't want to send. Options the chosen layout doesn't draw are greyed out.">
            <div className="vc-sora-fchecks">
                {SHOW_LABELS.map(([key, label]) => {
                    const reason = unavailableReason(key, draft);
                    const cell = (props?: object) => (
                        <div {...props} key={key} className={`vc-sora-fchk${reason ? " off" : ""}`}>
                            <span>{label}</span>
                            <Switch
                                checked={f.show[key]}
                                disabled={Boolean(reason)}
                                onChange={v => patch({ forwarding: { ...f, show: { ...f.show, [key]: v } } })}
                            />
                        </div>
                    );
                    return reason ? <Tooltip key={key} text={reason}>{props => cell(props)}</Tooltip> : cell();
                })}
            </div>
        </Field>
    );
}

// --- Preview ---

/** Who and where the sample message is from, so mentions and message links read like they do in Discord */
/** Who and where the sample message is from, so mentions and message links read like they do in Discord */
interface Who { name: string; guild: string; channel: string; }

/** Text with the bits of Discord markdown the messages use */
function Inline({ text, who }: { text: string; who: Who; }): React.ReactElement {
    const { name, guild, channel } = who;
    const parts = text.split(/(\\[\\*_`~|[\]<>]|\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|<@\d+>|<t:\d+:R>|https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+)/g);
    return (
        <>
            {parts.map((part, i) => {
                if (i % 2 === 0) return part;
                if (part.startsWith("\\")) return part.slice(1);
                if (part.startsWith("[")) return <a key={i} className="vc-sora-fp-link" onClick={e => e.preventDefault()}>{<Inline text={part.slice(1, part.indexOf("]("))} who={who} />}</a>;
                if (part.startsWith("`")) return <code key={i} className="vc-sora-fp-code">{part.slice(1, -1)}</code>;
                if (part.startsWith("**")) return <b key={i}>{<Inline text={part.slice(2, -2)} who={who} />}</b>;
                if (part.startsWith("__")) return <u key={i}>{part.slice(2, -2)}</u>;
                if (part.startsWith("<@")) return <span key={i} className="vc-sora-fp-mention">@{name}</span>;
                if (part.startsWith("https")) return <span key={i} className="vc-sora-fp-mention">{guild} › #{channel} › 💬</span>;
                return <span key={i} className="vc-sora-fp-stamp">just now</span>;
            })}
        </>
    );
}

const ANSI_COLORS: Record<string, string> = { 30: "#6b7078", 31: "#dc322f", 32: "#859900", 33: "#b58900", 34: "#268bd2", 36: "#2aa198", 37: "#ffffff" };

function Ansi({ code }: { code: string; }) {
    const out: React.ReactNode[] = [];
    const style: React.CSSProperties = {};
    const re = /\u001b\[([\d;]*)m/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const push = (chunk: string) => { if (chunk) out.push(<span key={out.length} style={{ ...style }}>{chunk}</span>); };
    while ((m = re.exec(code))) {
        push(code.slice(last, m.index));
        for (const c of m[1].split(";")) {
            if (c === "0" || c === "") { delete style.fontWeight; delete style.color; }
            else if (c === "1") style.fontWeight = 700;
            else if (ANSI_COLORS[c]) style.color = ANSI_COLORS[c];
        }
        last = re.lastIndex;
    }
    push(code.slice(last));
    return <>{out}</>;
}

function Markdown({ src, who }: { src: string; who: Who; }) {
    const blocks: React.ReactNode[] = [];
    const rows = src.split("\n");
    let list: string[] = [];
    const flush = () => {
        if (!list.length) return;
        blocks.push(<ul key={blocks.length}>{list.map((l, i) => <li key={i}><Inline text={l} who={who} /></li>)}</ul>);
        list = [];
    };

    for (let n = 0; n < rows.length; n++) {
        const line = rows[n];
        if (line.startsWith("- ")) { list.push(line.slice(2)); continue; }
        flush();
        if (line.startsWith("```")) {
            const end = rows.findIndex((r, k) => k > n && r.startsWith("```"));
            const body = rows.slice(n + 1, end === -1 ? undefined : end).join("\n");
            blocks.push(<pre key={blocks.length} className="vc-sora-fp-pre"><Ansi code={body} /></pre>);
            n = end === -1 ? rows.length : end;
        } else if (line.startsWith("-# ")) blocks.push(<span key={blocks.length} className="vc-sora-fp-sub"><Inline text={line.slice(3)} who={who} /></span>);
        else if (line.startsWith("### ")) blocks.push(<h3 key={blocks.length}><Inline text={line.slice(4)} who={who} /></h3>);
        else if (line.startsWith("## ")) blocks.push(<h2 key={blocks.length}><Inline text={line.slice(3)} who={who} /></h2>);
        else if (line.startsWith("> ")) blocks.push(<blockquote key={blocks.length}><div><Inline text={line.slice(2)} who={who} /></div></blockquote>);
        else if (line.trim()) blocks.push(<div key={blocks.length}><Inline text={line} who={who} /></div>);
    }
    flush();
    return <div className="vc-sora-fp-md">{blocks}</div>;
}

function Button({ label }: { label: string; }) {
    return <span className="vc-sora-fp-btn">{label}<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 2h7v7h-2V5.4l-8.3 8.3-1.4-1.4L18.6 4H15V2ZM4 6h7v2H5v11h11v-6h2v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" /></svg></span>;
}

function Component({ c, who }: { c: any; who: Who; }): React.ReactElement | null {
    switch (c.type) {
        case 17: return (
            <div className="vc-sora-fp-container" style={{ "--fp-accent": `#${(c.accent_color as number).toString(16).padStart(6, "0")}` } as React.CSSProperties}>
                {c.components.map((x: any, i: number) => <Component key={i} c={x} who={who} />)}
            </div>
        );
        case 9: return (
            <div className="vc-sora-fp-section" style={{ alignItems: c.accessory.type === 2 ? "center" : "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>{c.components.map((x: any, i: number) => <Component key={i} c={x} who={who} />)}</div>
                <Component c={c.accessory} who={who} />
            </div>
        );
        case 10: return <Markdown src={c.content} who={who} />;
        case 11: return <img className="vc-sora-fp-thumb" src={c.media.url} alt="" />;
        case 14: return <div className="vc-sora-fp-sep" />;
        case 1: return <div className="vc-sora-fp-row">{c.components.map((x: any, i: number) => <Component key={i} c={x} who={who} />)}</div>;
        case 2: return <Button label={c.label} />;
        default: return null;
    }
}

function EmbedPreview({ embed, who }: { embed: any; who: Who; }) {
    return (
        <div className="vc-sora-fp-embed" style={{ borderLeftColor: `#${(embed.color as number).toString(16).padStart(6, "0")}` }}>
            <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <a className="vc-sora-fp-link vc-sora-fp-embed-title" onClick={e => e.preventDefault()}>{embed.title}</a>
                <Markdown src={embed.description} who={who} />
                {embed.fields.length > 0 && (
                    <div className="vc-sora-fp-fields">
                        {embed.fields.map((f: any, i: number) => (
                            <div key={i}><b>{f.name}</b><Markdown src={String(f.value).replace(/^```|```$/g, "")} who={who} /></div>
                        ))}
                    </div>
                )}
                <span className="vc-sora-fp-sub">SolRadar{embed.timestamp ? " • just now" : ""}</span>
            </div>
            {embed.thumbnail && <img className="vc-sora-fp-thumb" src={embed.thumbnail.url} alt="" />}
        </div>
    );
}

function ForwardPreview({ draft, floating }: { draft: Draft; floating?: boolean; }) {
    const f = draft.forwarding;
    const biome = hasBiomeCheck(draft.type);
    // One message for every moment that is forwarded, since the panel beside the modal cannot take clicks
    const kinds: ForwardKind[] = [f.onMatch.enabled && "match", biome && f.onDetection.enabled && "detection"].filter(Boolean) as ForwardKind[];

    const name = UserStore.getCurrentUser()?.username ?? "someone";
    const who: Who = { name, guild: "test", channel: "fakechannel" };

    const messages = kinds.map(kind => {
        const payload = buildForwardPayload({
            forwarding: f,
            kind,
            triggerName: draft.name || "Trigger name",
            triggerType: draft.type,
            iconRef: resolveIcon(draft.iconUrl),
            hasBiome: hasBiomeStatus(draft),
            senderId: "0",
            senderName: name,
            serverLink: "https://www.roblox.com/share?code=example&type=Server",
            jumpUrl: "https://discord.com/channels/0/0/0",
            guildName: "test",
            guildId: "0",
            channelId: "0",
            channelName: "fakechannel",
            userMessage: "Example of what the sender wrote.",
            sentAt: Math.floor(Date.now() / 1000),
        });
        const body = payload.body as any;
        return (
            <div key={kind} className="vc-sora-fp-group">
                <div className="vc-sora-fp-msg">
                    <div className="vc-sora-fp-avatar">W</div>
                    <div className="vc-sora-fp-msgbody">
                        <div className="vc-sora-fp-head">
                            <b>{biome ? `Webhook · ${kind === "match" ? "On match" : "Biome confirmed"}` : "Webhook"}</b>
                            <span className="vc-sora-fp-app">APP</span>
                            <span>Today at 9:04 PM</span>
                        </div>
                        <div className="vc-sora-fp-chat">
                            {payload.components
                                ? (body.components as any[]).map((c, i) => <Component key={i} c={c} who={who} />)
                                : (
                                    <>
                                        {body.content && <Markdown src={body.content} who={who} />}
                                        <EmbedPreview embed={body.embeds[0]} who={who} />
                                    </>
                                )}
                        </div>
                    </div>
                </div>
            </div>
        );
    });

    if (!floating) return <Field label="Preview" hint="How the message looks when it reaches the webhook.">{messages}</Field>;
    return (
        <>
            <span style={labelText}>Preview</span>
            {messages}
        </>
    );
}

// The editor modal tells the preview when it starts closing, so both leave together
let editorClosing = false;
const closingListeners = new Set<() => void>();

export function setEditorClosing(value: boolean) {
    if (editorClosing === value) return;
    editorClosing = value;
    closingListeners.forEach(listener => listener());
}

/**
 * The panel beside the editor. React removes it at once when the section changes or forwarding is turned off,
 * so a copy of it fades out in its place.
 */
function FloatPanel({ host, closing, style, children }: { host: HTMLElement; closing: boolean; style: React.CSSProperties; children: React.ReactNode; }) {
    const panel = React.useRef<HTMLDivElement>(null);

    React.useLayoutEffect(() => () => {
        const el = panel.current;
        // When the whole modal is closing the panel has already faded with it
        if (!el || editorClosing) return;
        const ghost = el.cloneNode(true) as HTMLElement;
        ghost.style.animation = "none";
        host.appendChild(ghost);
        void ghost.offsetWidth;
        ghost.classList.add("leaving");
        setTimeout(() => ghost.remove(), 250);
    }, []);

    return ReactDOM.createPortal(
        <div ref={panel} className={`vc-sora-fp-float vc-sora-thin-scroll${closing ? " leaving" : ""}`} style={style}>
            {children}
        </div>,
        host
    );
}

const PANEL_WIDTH = 420;
const PANEL_MIN_WIDTH = 280;
const PANEL_GAP = 16;

/**
 * The preview floats beside the editor, so it stays in view while the settings scroll.
 * It shows only while something is forwarded. With no room beside the editor it goes back inline.
 */
export function FloatingPreview({ draft }: { draft: Draft; }) {
    const f = draft.forwarding;
    const forwards = f.onMatch.enabled || (hasBiomeCheck(draft.type) && f.onDetection.enabled);
    const anchor = React.useRef<HTMLSpanElement>(null);
    const [box, setBox] = React.useState<{ left: number; top: number; width: number; maxHeight: number; } | null>(null);
    // Inside Discord's layer container the panel sits above the modal backdrop, which would otherwise dim it
    const [host, setHost] = React.useState<HTMLElement | null>(null);
    const [closing, setClosing] = React.useState(editorClosing);
    React.useEffect(() => {
        const sync = () => setClosing(editorClosing);
        closingListeners.add(sync);
        return () => { closingListeners.delete(sync); };
    }, []);

    React.useEffect(() => {
        const dialog = (anchor.current?.closest('[role="dialog"]') ?? anchor.current?.closest(".vc-sora-editor-body")) as HTMLElement | null;
        if (!dialog) return;
        const layer = dialog.closest<HTMLElement>('[class*="layerContainer"]');
        setHost(layer);

        const place = () => {
            const rect = dialog.getBoundingClientRect();
            const left = rect.right + PANEL_GAP;
            const width = Math.min(PANEL_WIDTH, window.innerWidth - left - PANEL_GAP);
            setBox(width >= PANEL_MIN_WIDTH ? { left, top: rect.top, width, maxHeight: window.innerHeight - rect.top - PANEL_GAP } : null);
        };

        place();
        // The modal can still be animating in when this first runs
        const settle = setTimeout(place, 300);
        const observer = new ResizeObserver(place);
        observer.observe(dialog);
        window.addEventListener("resize", place);

        return () => {
            clearTimeout(settle);
            observer.disconnect();
            window.removeEventListener("resize", place);
        };
    }, []);

    return (
        <>
            <span ref={anchor} style={{ display: "none" }} />
            {forwards && (box
                ? (
                    <FloatPanel host={host ?? document.body} closing={closing} style={{ ...box, zIndex: host ? 1002 : 100000 }}>
                        <ForwardPreview draft={draft} floating />
                    </FloatPanel>
                )
                : <ForwardPreview draft={draft} />)}
        </>
    );
}
