/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/choice.css";
import "../../ui/OrderSlot.css";
import "./triggers.css";

import { Button } from "@components/Button";
import { DeleteIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Alerts, ContextMenuApi, Menu, React, ReactDOM, ScrollerThin, showToast, Tooltip, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "../../../settings";
import { countChanges, DEFAULT_TRIGGERS, markDefaultsSeen, pendingChanges } from "../../../stores/defaultTriggers";
import { emitTourSignal, useTourAction, useTourState } from "../../../stores/TourStore";
import {
    deleteAllTriggers,
    deleteTrigger,
    downloadTriggersJson,
    downloadTriggersJsonRedacted,
    getFolder,
    getFolders,
    getLayout,
    importTriggers,
    isTriggerHidden,
    isTriggerRunning,
    moveFolder,
    moveTrigger,
    parseTriggersFile,
    RedactField,
    toggleTrigger,
    Trigger,
    TriggerFolder,
    triggerStoreReady,
    TriggerType,
    updateFolder,
    updateTrigger,
    useFolders,
    useTriggers,
} from "../../../stores/TriggerStore";
import { UIState } from "../../../stores/UIStateStore";
import { isDeveloper } from "../../../utils";
import { JoinLockBanner } from "../../JoinLockBanner";
import { fakeMouseEvent } from "../../tour/anchors";
import { TourAnchor, tourAnchor } from "../../tour/TourAnchor";
import { useAutoTour } from "../../tour/useAutoTour";
import { DeleteButton } from "../../ui/buttons/DeleteButton";
import { QuerySearchInput, splitQuery } from "../../ui/QuerySearchInput";
import { COLORS } from "../../ui/styles";
import { useShiftHeld } from "../../ui/useShiftHeld";
import { DefaultsNudge } from "./DefaultsNudge";
import { TriggerIcon, TYPE_META } from "./editor/sections";
import { confirmWebhookThenRun } from "./exportActions";
import { FolderCount, FolderGlyph, FolderHeader, openFolderEditor } from "./folders";
import { importSummary, openDefaultsPicker, openFilePicker } from "./ImportPicker";
import { PublicExportOptions } from "./PublicExportOptions";
import { pickTourCard, pickTourFolder } from "./tourTarget";
import { openTriggerContextMenu } from "./TriggerContextMenu";
import { openAddTriggerModal, openEditTriggerModal } from "./TriggerModal";

// --- Query parser ---

type TextField = "name" | "description" | "keyword";
type BoolKey = "enabled" | "join" | "notify" | "lock" | "hidden";
type Priority = { op: "eq" | "gt" | "lt"; value: number; };

interface TextTerm { negated: boolean; field?: TextField; value: string; }
/** `none` means outside every folder, anything else is the start of a folder name */
interface FolderTerm { negated: boolean; value: string; }

interface ParsedQuery {
    text: string;
    terms: TextTerm[];
    enabled: boolean | null;
    autojoin: boolean | null;
    notify: boolean | null;
    lock: boolean | null;
    priority: Priority | null;
    /** `any` shows hidden and normal triggers together */
    hidden: boolean | "any" | null;
    folders: FolderTerm[];
}

function parseBool(v: string): boolean | null {
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return null;
}

const BOOL_QUERY_LABELS: Record<BoolKey, [on: string, off: string]> = {
    enabled: ["Only triggers that are enabled", "Only triggers that are disabled"],
    join: ["Only triggers that auto-join", "Only triggers that don't auto-join"],
    notify: ["Only triggers that notify you", "Only triggers that don't notify you"],
    lock: ["Only triggers that use the join lock", "Only triggers that don't use the join lock"],
    hidden: ["Show only hidden triggers", "Hide hidden triggers (the default)"],
};

const TEXT_KEYS: Record<string, TextField> = { name: "name", desc: "description", description: "description", keyword: "keyword", keywords: "keyword" };
const TEXT_LABELS: Record<TextField, string> = { name: "whose name contains", description: "whose description contains", keyword: "with a keyword containing" };

type Word =
    | { kind: "bool"; key: BoolKey; value: boolean; }
    | { kind: "priority"; priority: Priority; }
    | { kind: "text"; term: TextTerm; }
    | { kind: "hiddenAny"; }
    | { kind: "folder"; term: FolderTerm; }
    | { kind: "invalid"; message: string; };

const has = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

// `key:value`, `key:"two words"`, `!key:value` or `!word`. Anything else is plain text.
function parseWord(word: string): Word | null {
    const negated = word.startsWith("!");
    const body = negated ? word.slice(1) : word;
    const m = /^(\w+):(.*)$/.exec(body);

    if (m) {
        const key = m[1].toLowerCase();
        const raw = m[2];

        if (key === "hidden" && raw.toLowerCase() === "any") {
            return negated ? { kind: "invalid", message: "hidden:any can't be negated. Use hidden:no instead" } : { kind: "hiddenAny" };
        }

        if (key === "folder") {
            const value = raw.replace(/^"/, "").replace(/"$/, "").trim().toLowerCase();
            return value ? { kind: "folder", term: { negated, value } } : null;
        }

        if (has(BOOL_QUERY_LABELS, key)) {
            if (!raw) return null;
            const b = parseBool(raw.toLowerCase());
            return b === null
                ? { kind: "invalid", message: `Invalid value. Use ${key}:yes or ${key}:no` }
                : { kind: "bool", key: key as BoolKey, value: negated ? !b : b };
        }

        if (key === "priority") {
            if (!raw) return null;
            if (negated) return { kind: "invalid", message: "priority can't be negated. Use priority:<5 or priority:>5 instead" };
            const p = /^([<>]?)(\d+)$/.exec(raw);
            if (!p) return { kind: "invalid", message: "Invalid priority. Use priority:5, priority:>5 or priority:<5" };
            return { kind: "priority", priority: { op: p[1] === ">" ? "gt" : p[1] === "<" ? "lt" : "eq", value: parseInt(p[2]) } };
        }

        if (has(TEXT_KEYS, key)) {
            const value = raw.replace(/^"/, "").replace(/"$/, "").trim().toLowerCase();
            return value ? { kind: "text", term: { negated, field: TEXT_KEYS[key], value } } : null;
        }
    }

    return negated && body ? { kind: "text", term: { negated, value: body.toLowerCase() } } : null;
}

function describeQueryTerm(word: string): string | undefined {
    const w = parseWord(word);
    if (!w) return;
    switch (w.kind) {
        case "invalid": return w.message;
        case "bool": return BOOL_QUERY_LABELS[w.key][w.value ? 0 : 1];
        case "hiddenAny": return "Show hidden and normal triggers together";
        case "folder": {
            const { negated, value } = w.term;
            if (value === "none") return negated ? "Only triggers inside a folder" : "Only triggers outside folders";
            return `${negated ? "Hide triggers" : "Only triggers"} in folders whose name starts with "${value}"`;
        }
        case "priority": return `Only triggers with priority ${w.priority.op === "gt" ? "above" : w.priority.op === "lt" ? "below" : "exactly"} ${w.priority.value}`;
        case "text": {
            const { negated, field, value } = w.term;
            if (!field) return `Hide triggers that mention "${value}" in the name, description or keywords`;
            return `${negated ? "Hide triggers" : "Only triggers"} ${TEXT_LABELS[field]} "${value}"`;
        }
    }
}

const isNegatedWord = (word: string) => word.startsWith("!") && !!parseWord(word);

/**
 * Parses a query string into structured filters.
 * Supported tokens: enabled: join: notify: lock: hidden: (also hidden:any) priority: (=/>/<) name: description: keyword: folder:
 * A leading ! negates one, and a value in quotes may hold spaces. Everything else is free-text search.
 */
function parseQuery(raw: string): ParsedQuery {
    const result: ParsedQuery = {
        text: "", terms: [], enabled: null, autojoin: null,
        notify: null, lock: null, priority: null, hidden: null, folders: [],
    };
    const free: string[] = [];

    splitQuery(raw).forEach((word, i) => {
        if (i % 2 === 0) return;
        const w = parseWord(word);
        if (!w) { free.push(word); return; }
        switch (w.kind) {
            case "bool":
                if (w.key === "join") result.autojoin = w.value;
                else result[w.key] = w.value;
                break;
            case "priority": result.priority = w.priority; break;
            case "text": result.terms.push(w.term); break;
            case "hiddenAny": result.hidden = "any"; break;
            case "folder": result.folders.push(w.term); break;
        }
    });

    result.text = free.join(" ").toLowerCase();
    return result;
}

function applyQuery(triggers: Trigger[], q: ParsedQuery, typeFilter: TriggerType | "all"): Trigger[] {
    return triggers.filter(t => {
        if (typeFilter !== "all" && t.type !== typeFilter) return false;

        // Hidden triggers, and triggers in hidden folders, only show up when the filter asks for them
        if (q.hidden !== "any" && isTriggerHidden(t) !== (q.hidden ?? false)) return false;

        // A trigger in a paused folder counts as off
        if (q.enabled !== null && isTriggerRunning(t) !== q.enabled) return false;
        if (q.autojoin !== null && t.state.autojoin !== q.autojoin) return false;
        if (q.notify !== null && t.state.notify !== q.notify) return false;
        if (q.lock !== null && t.state.joinlock !== q.lock) return false;

        if (q.priority !== null) {
            const p = t.state.priority;
            if (q.priority.op === "eq" && p !== q.priority.value) return false;
            if (q.priority.op === "gt" && p <= q.priority.value) return false;
            if (q.priority.op === "lt" && p >= q.priority.value) return false;
        }

        const folder = getFolder(t.folderId);
        const folderName = folder?.name.toLowerCase();
        if (!q.folders.every(({ negated, value }) => (value === "none" ? !folder : !!folderName?.startsWith(value)) !== negated)) return false;

        const keywords = t.conditions.keywords.match.value.map(k => k.toLowerCase());
        const name = t.name.toLowerCase();
        const description = t.description.toLowerCase();

        // Text that matches the folder's name or description brings the whole folder
        const folderText = folder ? `${folderName} ${folder.description.toLowerCase()}` : "";
        if (q.text && !`${name} ${description} ${keywords.join(" ")}`.includes(q.text) && !folderText.includes(q.text)) return false;

        return q.terms.every(({ negated, field, value }) => {
            const hit = field === "name" ? name.includes(value)
                : field === "description" ? description.includes(value)
                : field === "keyword" ? keywords.some(k => k.includes(value))
                : `${name} ${description} ${keywords.join(" ")}`.includes(value);
            return hit !== negated;
        });
    });
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

function confirmDeleteAll(count: number) {
    Alerts.show({
        title: "Delete all triggers?",
        body: <Paragraph>This deletes all {count} of your triggers. Export them first if you want a backup. It can't be undone.</Paragraph>,
        confirmText: "Delete all",
        cancelText: "Cancel",
        onConfirm: async () => {
            await deleteAllTriggers();
            showToast({ text: "All triggers deleted." });
        },
    });
}

type TypeFilter = TriggerType | "all";

function openTypeFilterMenu(e: React.MouseEvent, triggers: Trigger[], current: TypeFilter, onChange: (f: TypeFilter) => void, onSearch: (q: string) => void) {
    const options: TypeFilter[] = ["all", ...(Object.keys(TYPE_META) as TriggerType[])];
    const hiddenCount = triggers.filter(isTriggerHidden).length;
    const hasHiddenFolder = getFolders().some(f => f.hidden);

    // The menu is placed once, where it was opened, so a resize would leave it floating in the wrong spot
    const onResize = () => ContextMenuApi.closeContextMenu();
    window.addEventListener("resize", onResize);

    // The menu does not redraw after a pick, so it closes instead of showing a stale selection
    const pick = (fn: () => void) => () => { fn(); ContextMenuApi.closeContextMenu(); };

    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu
            navId="vc-sora-triggers-filter"
            onClose={() => { window.removeEventListener("resize", onResize); ContextMenuApi.closeContextMenu(); }}
            aria-label="Filter triggers"
        >
            {options.map(type => {
                const count = triggers.filter(t => !isTriggerHidden(t) && (type === "all" || t.type === type)).length;
                return (
                    <Menu.MenuRadioItem
                        key={type}
                        id={`vc-sora-triggers-filter-${type}`}
                        group="vc-sora-triggers-filter"
                        label={`${type === "all" ? "All types" : TYPE_META[type].label} (${count})`}
                        checked={current === type}
                        action={pick(() => onChange(type))}
                    />
                );
            })}
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-sora-triggers-filter-hidden"
                label={`Hidden triggers (${hiddenCount})`}
                disabled={!hiddenCount && !hasHiddenFolder}
                action={pick(() => onSearch("hidden:yes"))}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-sora-triggers-filter-all"
                label={`Show all (${triggers.length})`}
                disabled={!hiddenCount && !hasHiddenFolder}
                action={pick(() => onSearch("hidden:any"))}
            />
        </Menu.Menu>
    ));
}

// --- Card ---

function PowerIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v9" />
            <path d="M6.3 7.5a8 8 0 1 0 11.4 0" />
        </svg>
    );
}

const MAX_STAGGER_MS = 300;
const DRAG_THRESHOLD_PX = 5;

function QuickToggle({ on, emoji, color, tooltip, onClick }: {
    on: boolean; emoji: string; color: string; tooltip: string; onClick: () => void;
}) {
    return (
        <Tooltip text={tooltip}>
            {props => (
                <button
                    {...props}
                    type="button"
                    aria-pressed={on}
                    className={`vc-sora-trigger-qt${on ? " on" : ""}`}
                    style={{ "--sora-c": color } as React.CSSProperties}
                    onClick={e => { e.stopPropagation(); onClick(); }}
                    onContextMenu={e => e.stopPropagation()}
                >
                    <span className="emoji">{emoji}</span>
                </button>
            )}
        </Tooltip>
    );
}

// For a card with no description and no keywords: what it matches on instead (a role ping, a channel, a user)
function matchSummary(t: Trigger): string {
    const { mentionRoles, inChannel, fromUser } = t.conditions;
    const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
    const parts = [
        mentionRoles.length && count(mentionRoles.length, "role ping"),
        inChannel.length && count(inChannel.length, "channel"),
        fromUser.length && count(fromUser.length, "user"),
    ].filter(Boolean);
    return parts.length ? `Matches by ${parts.join(", ")}` : "No keywords yet";
}

function TriggerCard({
    trigger,
    position,
    tourTarget,
    isFirst,
    isLast,
    folderPaused,
    orderingDisabled,
    useButtonsForOrdering,
    useContextMenu,
    shiftHeld,
    isDragging,
    onMoveUp,
    onMoveDown,
    onDragStart,
}: {
    trigger: Trigger;
    /** Place in the visible list, for the entry stagger */
    position: number;
    /** The card the triggers tour points at */
    tourTarget: boolean;
    /** First and last in its own folder (or outside folders) */
    isFirst: boolean;
    isLast: boolean;
    folderPaused: boolean;
    orderingDisabled: boolean;
    useButtonsForOrdering: boolean;
    useContextMenu: boolean;
    shiftHeld: boolean;
    isDragging: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDragStart: (e: React.PointerEvent, cardRect: DOMRect) => void;
}) {
    const cardRef = useRef<HTMLDivElement>(null);
    // The whole card is the drag handle: a press only becomes a drag once the pointer moves a few pixels,
    // so a plain click still opens the editor.
    const pressRef = useRef<{ x: number; y: number; } | null>(null);
    const draggedRef = useRef(false);
    const canDrag = !orderingDisabled && !useButtonsForOrdering;
    const meta = TYPE_META[trigger.type];
    const { enabled, autojoin, notify, joinlock, priority } = trigger.state;
    const forwards = trigger.forwarding.onMatch.enabled || trigger.forwarding.onDetection.enabled;
    const keywords = trigger.conditions.keywords.match.value;
    const subline = trigger.description || (keywords.length ? keywords.join(", ") : matchSummary(trigger));
    const paused = enabled && folderPaused;

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const setState = (p: Partial<Trigger["state"]>) => updateTrigger(trigger.id, { state: { ...trigger.state, ...p } });

    return (
        <div
            ref={cardRef}
            {...tourAnchor(tourTarget ? "triggers.firstCard" : undefined)}
            data-trigger-id={trigger.id}
            className={`vc-sora-trigger-card${enabled && !paused ? "" : " off"}${trigger.hidden ? " hidden" : ""}${isDragging ? " dragging" : ""}`}
            style={{ animationDelay: `${Math.min(position * 30, MAX_STAGGER_MS)}ms` }}
            onPointerDown={e => {
                draggedRef.current = false;
                if (!canDrag || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
                pressRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={e => {
                const press = pressRef.current;
                if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
                pressRef.current = null;
                draggedRef.current = true;
                if (cardRef.current) onDragStart(e, cardRef.current.getBoundingClientRect());
            }}
            onPointerUp={() => { pressRef.current = null; }}
            onPointerLeave={() => { pressRef.current = null; }}
            onClick={() => {
                if (draggedRef.current) draggedRef.current = false;
                else openEditTriggerModal(trigger);
            }}
            onContextMenu={e => {
                e.preventDefault();
                if (useContextMenu) openTriggerContextMenu(e, trigger);
                else toggleTrigger(trigger.id);
            }}
        >
            {!orderingDisabled && useButtonsForOrdering && (
                <div className="vc-sora-orderslot" style={s.orderButtons} onClick={stop} onContextMenu={stop}>
                    <button className="vc-sora-iconbtn" style={s.orderBtn(isFirst)} disabled={isFirst} onClick={onMoveUp} title="Move this card up">▲</button>
                    <button className="vc-sora-iconbtn" style={s.orderBtn(isLast)} disabled={isLast} onClick={onMoveDown} title="Move this card down">▼</button>
                </div>
            )}

            <Tooltip text={enabled ? "Enabled. Click to disable." : "Disabled. Click to enable."}>
                {props => (
                    <button
                        {...props}
                        {...tourAnchor(tourTarget ? "triggers.firstIcon" : undefined)}
                        type="button"
                        aria-pressed={enabled}
                        aria-label={enabled ? "Disable trigger" : "Enable trigger"}
                        className="vc-sora-trigger-power"
                        onClick={e => { e.stopPropagation(); toggleTrigger(trigger.id); }}
                        onContextMenu={stop}
                    >
                        <TriggerIcon draft={trigger} size={40} />
                        <span className="vc-sora-trigger-power-ov"><PowerIcon /></span>
                    </button>
                )}
            </Tooltip>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="vc-sora-trigger-name">{trigger.name}</span>
                    <span className="vc-sora-trigger-type" style={{ "--sora-c": meta.color } as React.CSSProperties}>{meta.label}</span>
                    {trigger.hidden && (
                        <Tooltip text="Hidden from the list. Right-click and choose Unhide to bring it back.">
                            {props => <span {...props} className="vc-sora-trigger-offtag">Hidden</span>}
                        </Tooltip>
                    )}
                    {paused && (
                        <Tooltip text="Its folder is paused. Turn the folder on to run it.">
                            {props => <span {...props} className="vc-sora-trigger-offtag">Folder off</span>}
                        </Tooltip>
                    )}
                    {!enabled && (
                        <Tooltip text="This trigger is off. Click its icon to enable it.">
                            {props => <span {...props} className="vc-sora-trigger-offtag">Disabled</span>}
                        </Tooltip>
                    )}
                </div>
                <Tooltip text={subline}>
                    {props => <span {...props} className="vc-sora-trigger-sub">{subline}</span>}
                </Tooltip>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div className="vc-sora-trigger-qts">
                    <QuickToggle
                        on={autojoin}
                        emoji="🎯"
                        color="var(--green-360)"
                        tooltip={`Auto-join: ${autojoin ? "on" : "off"}. Joins the server as soon as it matches.`}
                        onClick={() => setState({ autojoin: !autojoin })}
                    />
                    <QuickToggle
                        on={notify}
                        emoji="🔔"
                        color="var(--blue-345)"
                        tooltip={`Notify: ${notify ? "on" : "off"}. Shows a desktop notification on a match.`}
                        onClick={() => setState({ notify: !notify })}
                    />
                    <QuickToggle
                        on={forwards}
                        emoji="➡️"
                        color="var(--blue-345)"
                        tooltip={`Forward: ${forwards ? "on" : "off"}. Sends the match to a webhook.`}
                        onClick={() => updateTrigger(trigger.id, {
                            forwarding: forwards
                                ? { ...trigger.forwarding, onMatch: { ...trigger.forwarding.onMatch, enabled: false }, onDetection: { enabled: false } }
                                : { ...trigger.forwarding, onMatch: { ...trigger.forwarding.onMatch, enabled: true } },
                        })}
                    />
                </div>
                <Tooltip text={joinlock ? `Priority ${priority}, with join lock. Lower is more important.` : `Priority ${priority}. Lower is more important.`}>
                    {props => <span {...props} {...tourAnchor(tourTarget ? "triggers.firstPriority" : undefined)} className="vc-sora-trigger-prio">{joinlock ? "🔒" : "★"} {priority}</span>}
                </Tooltip>
            </div>
            {shiftHeld && <DeleteButton visible hint="Delete this trigger" onClick={() => deleteTrigger(trigger.id)} />}
        </div>
    );
}

// Drag preview: just icon and name, like Discord's own reorder previews.
function DragGhost({ trigger }: { trigger: Trigger; }) {
    return (
        <div style={s.dragGhost}>
            <TriggerIcon draft={trigger} size={40} />
            <span className="vc-sora-trigger-name">{trigger.name}</span>
        </div>
    );
}

function FolderDragGhost({ folder }: { folder: TriggerFolder; }) {
    return (
        <div style={{ ...s.dragGhost, color: folder.color }}>
            <FolderGlyph size={22} />
            <span className="vc-sora-trigger-name">{folder.name}</span>
        </div>
    );
}

// --- Drop slots ---
// Read from the DOM while dragging. A slot is a place between two cards (or folders) where the dragged one can land.

interface Slot {
    y: number;
    left: number;
    width: number;
    /** Group the slot belongs to, null outside folders */
    folderId: string | null;
    /** Lands right before this one, or last in the group when null */
    beforeId: string | null;
    /** Dropping here would not move anything */
    noop: boolean;
}

// Half the gap between cards, so the line sits in the middle of it
const SLOT_GAP = 3;

const itemKey = (el: HTMLElement) => el.dataset.triggerId ?? el.dataset.folderSection!;
const TOP_ITEMS = ":scope > [data-trigger-id], :scope > [data-folder-section]";

function triggerSlots(wrapper: HTMLElement, dragId: string): Slot[] {
    const out: Slot[] = [];
    wrapper.querySelectorAll<HTMLElement>("[data-trigger-group]:not([data-closed])").forEach(group => {
        const folderId = group.dataset.triggerGroup || null;
        // Outside folders, cards and folders share the list
        const cards = Array.from(group.querySelectorAll<HTMLElement>(folderId ? ":scope > [data-trigger-id]" : TOP_ITEMS));
        const self = cards.findIndex(c => c.dataset.triggerId === dragId);

        cards.forEach((card, i) => {
            if (i === self) return;
            const r = card.getBoundingClientRect();
            out.push({ y: r.top - SLOT_GAP, left: r.left, width: r.width, folderId, beforeId: itemKey(card), noop: self !== -1 && i === self + 1 });
        });

        const last = cards[cards.length - 1];
        const r = (last ?? group).getBoundingClientRect();
        out.push({
            y: last ? r.bottom + SLOT_GAP : r.top + r.height / 2,
            left: r.left,
            width: r.width,
            folderId,
            beforeId: null,
            noop: self !== -1 && self === cards.length - 1,
        });
    });
    return out;
}

// Folders move along the list outside folders, between cards too, but never into another folder
function folderSlots(wrapper: HTMLElement, dragId: string): Slot[] {
    const top = wrapper.querySelector<HTMLElement>("[data-trigger-group='']");
    const sections = Array.from(top?.querySelectorAll<HTMLElement>(TOP_ITEMS) ?? []);
    const self = sections.findIndex(el => el.dataset.folderSection === dragId);
    const out: Slot[] = [];

    sections.forEach((el, i) => {
        if (i === self) return;
        const r = el.getBoundingClientRect();
        out.push({ y: r.top - SLOT_GAP, left: r.left, width: r.width, folderId: null, beforeId: itemKey(el), noop: i === self + 1 });
    });

    const last = sections[sections.length - 1];
    if (last) {
        const r = last.getBoundingClientRect();
        out.push({ y: r.bottom + SLOT_GAP, left: r.left, width: r.width, folderId: null, beforeId: null, noop: self === sections.length - 1 });
    }
    return out;
}

// --- Styles ---

const s = {
    orderButtons: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
        flexShrink: 0,
    },
    // Background, color and hover come from .vc-sora-iconbtn
    orderBtn: (disabled: boolean): React.CSSProperties => ({
        border: "none",
        padding: "1px 4px",
        fontSize: 12,
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
        ...(disabled && { color: "var(--control-secondary-text-default)" }),
        opacity: disabled ? 0.3 : 1,
        borderRadius: 3,
    }),
    dragGhost: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-secondary)",
        border: "1px solid var(--background-modifier-accent)",
    } as React.CSSProperties,
};

// --- Tab ---

type DragTarget = { folderId: string | null; beforeId: string | null; };

type TopItem =
    | { kind: "trigger"; trigger: Trigger; }
    | { kind: "folder"; folder: TriggerFolder; triggers: Trigger[]; };

export function TriggersTab() {
    const triggers = useTriggers();
    const folders = useFolders();
    const importRef = useRef<HTMLInputElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const moreBtnRef = useRef<HTMLButtonElement>(null);
    const importingRef = useRef(false);
    useAutoTour("triggers");
    const saved = UIState.get("triggers");
    const shiftHeld = useShiftHeld();
    const [search, setSearch] = useState(saved.search);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>(saved.typeFilter);
    const { useButtonsForOrderingTriggers: useButtonsForOrdering, useTriggerTabContextMenu: useContextMenu, defaultsSeen, showDefaultsNudge, alwaysShowFolderCount } = settings.use([
        "useButtonsForOrderingTriggers",
        "alwaysShowFolderCount",
        "useTriggerTabContextMenu",
        "defaultsSeen",
        "showDefaultsNudge",
    ]);

    // Cards only fade in when the tab opens. Opening a folder or dropping a card mounts them again, and must not blink.
    const [settled, setSettled] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setSettled(true), 1000);
        return () => clearTimeout(t);
    }, []);

    // Triggers load a moment after the tab opens. Until then every default would look new.
    const [storeReady, setStoreReady] = useState(false);
    useEffect(() => { triggerStoreReady.then(() => setStoreReady(true)); }, []);
    const tourRunning = useTourState().tour !== null;
    const defaultChanges = React.useMemo(
        () => storeReady ? pendingChanges(triggers) : { added: [], updated: [] },
        [storeReady, triggers, defaultsSeen]
    );
    const changeCount = countChanges(defaultChanges);
    const showNudge = showDefaultsNudge && changeCount > 0 && !tourRunning;

    const handleSearchChange = (v: string) => {
        setSearch(v);
        UIState.set("triggers", { search: v });
    };

    const handleTypeFilterChange = (f: TypeFilter) => {
        setTypeFilter(f);
        UIState.set("triggers", { typeFilter: f });
    };

    const query = React.useMemo(() => parseQuery(search), [search]);
    // `folders` is a dependency because folder names, hiding and pausing change the result
    const filtered = React.useMemo(() => applyQuery(triggers, query, typeFilter), [triggers, folders, query, typeFilter]);

    // Any search or type filter narrows the list: folders without a match disappear, the rest open, and reordering is off
    const narrowed = search.trim() !== "" || typeFilter !== "all";
    const orderingDisabled = narrowed;
    // A lone hidden: filter also lists hidden folders that are empty, so they can be found and unhidden
    const onlyHiddenFilter = typeFilter === "all" && /^\s*hidden:\S+\s*$/i.test(search) && (query.hidden === true || query.hidden === "any");

    // Folders and triggers outside folders, mixed, in the saved order
    const top = React.useMemo(() => {
        const shown = new Set(filtered.map(t => t.id));
        const byId = new Map(triggers.map(t => [t.id, t]));
        const items: TopItem[] = [];
        for (const key of getLayout()) {
            const folder = folders.find(f => f.id === key);
            if (folder) {
                const list = filtered.filter(t => t.folderId === folder.id);
                const show = narrowed
                    ? list.length > 0 || (onlyHiddenFilter && (!!folder.hidden || query.hidden === "any"))
                    : !folder.hidden;
                if (show) items.push({ kind: "folder", folder, triggers: list });
            } else if (shown.has(key)) {
                items.push({ kind: "trigger", trigger: byId.get(key)! });
            }
        }
        return items;
    }, [filtered, triggers, folders, narrowed, onlyHiddenFilter, query]);

    // While the tour talks about cards and none is on screen, it opens the first folder that has one.
    // Only here, never saved, so the user's closed folders stay closed.
    const [tourOpenFolder, setTourOpenFolder] = useState<string | null>(null);
    const isOpen = (f: TriggerFolder) => narrowed || !f.collapsed || f.id === tourOpenFolder;

    // What the tour points at: a card on screen (not in a closed folder) and the first folder
    const tourItems = top.map(item => item.kind === "folder" ? { ...item, open: isOpen(item.folder) } : item);
    const tourCard = pickTourCard(tourItems);
    const tourFolder = pickTourFolder(tourItems);

    useTourAction("triggers.revealCard", () => {
        if (tourCard) return;
        const first = top.find(item => item.kind === "folder" && item.triggers.length > 0);
        if (first?.kind === "folder") setTourOpenFolder(first.folder.id);
    });
    useTourAction("triggers.unrevealCard", () => setTourOpenFolder(null));

    // Counts what the folder shows, so hidden triggers don't give themselves away
    const countFor = (f: TriggerFolder): FolderCount => {
        const ts = triggers.filter(t => t.folderId === f.id && (f.hidden || query.hidden === "any" || !!t.hidden === (query.hidden ?? false)));
        return { on: ts.filter(t => t.state.enabled).length, total: ts.length };
    };

    const importDefaults = async () => {
        if (importingRef.current) return;
        importingRef.current = true;
        try {
            // Skip the ones the user already has, or they would come back as copies with new ids
            const owned = new Set(triggers.map(t => t.id));
            const added = await importTriggers(DEFAULT_TRIGGERS.filter(d => !owned.has(d.id)));
            showToast({ text: importSummary(added, 0), variant: "success" });
            emitTourSignal("triggers:imported");
        } finally {
            importingRef.current = false;
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        const reader = new FileReader();
        reader.onload = ev => {
            const result = parseTriggersFile(ev.target?.result as string);
            if (result.ok) openFilePicker(result.triggers, file.name);
            else showToast({ text: `Import failed: ${result.error}`, variant: "critical" });
        };
        reader.readAsText(file);
    };

    const handleExport = () => {
        confirmWebhookThenRun(triggers, () => {
            try {
                downloadTriggersJson();
                showToast({ text: "Successfully exported triggers!", variant: "success" });
            } catch (error) {
                showToast({ text: `Failed to export triggers: ${error}`, variant: "critical" });
            }
        });
    };

    const handlePublicExport = () => {
        let currentFields = new Set<RedactField>(["webhookUrl", "webhookForwarding", "notificationSound", "enabled", "customTriggers"]);

        Alerts.show({
            title: "Public Export",
            body: <PublicExportOptions onChange={fields => { currentFields = fields; }} />,
            confirmText: "Export",
            cancelText: "Cancel",
            onConfirm: () => {
                try {
                    downloadTriggersJsonRedacted({ redact: [...currentFields] });
                    showToast({ text: "Successfully exported triggers!", variant: "success" });
                } catch (error) {
                    showToast({ text: `Failed to export triggers: ${error}`, variant: "critical" });
                }
            },
        });
    };

    // The ▲▼ buttons move a card inside its own folder, or along the list outside folders (past folders too)
    const moveWithinGroup = (list: Trigger[], i: number, dir: -1 | 1) => {
        const t = list[i];
        const folderId = getFolder(t.folderId) ? t.folderId! : null;
        if (folderId) {
            const other = list[i + dir];
            if (!other) return;
            if (dir === -1) moveTrigger(t.id, folderId, other.id);
            else moveTrigger(other.id, folderId, t.id);
            return;
        }
        const keys = top.map(item => item.kind === "trigger" ? item.trigger.id : item.folder.id);
        const at = keys.indexOf(t.id);
        if (dir === -1 && at > 0) moveTrigger(t.id, null, keys[at - 1]);
        if (dir === 1 && at < keys.length - 1) moveTrigger(t.id, null, keys[at + 2] ?? null);
    };

    // --- Drag to reorder ---
    // Uses pointer events because native drag-and-drop is unreliable in Electron
    // (drag image, clipping, tiny hitboxes).
    const [drag, setDrag] = useState<{
        kind: "trigger" | "folder";
        id: string;
        width: number;
        grabOffsetX: number;
        grabOffsetY: number;
        pointerClientX: number;
        pointerClientY: number;
        target: DragTarget | null;
        /** Folder header under the pointer: the trigger goes to the end of that folder */
        dropFolder: string | null;
        indicator: { top: number; left: number; width: number; } | null;
    } | null>(null);

    const startDrag = (kind: "trigger" | "folder", id: string, e: React.PointerEvent, rect: DOMRect) => {
        e.preventDefault();
        setDrag({
            kind,
            id,
            width: rect.width,
            grabOffsetX: e.clientX - rect.left,
            grabOffsetY: e.clientY - rect.top,
            pointerClientX: e.clientX,
            pointerClientY: e.clientY,
            target: null,
            dropFolder: null,
            indicator: null,
        });
    };

    useEffect(() => {
        if (!drag) return;
        const { kind, id } = drag;

        const onMove = (e: PointerEvent) => {
            const wrapper = wrapperRef.current;
            const containerRect = containerRef.current?.getBoundingClientRect();
            const wrapperRect = wrapper?.getBoundingClientRect();

            let target: DragTarget | null = null;
            let dropFolder: string | null = null;
            let indicator: NonNullable<typeof drag>["indicator"] = null;

            const nearContainer = containerRect
                && e.clientX >= containerRect.left - 40 && e.clientX <= containerRect.right + 40
                && e.clientY >= containerRect.top - 40 && e.clientY <= containerRect.bottom + 40;

            if (nearContainer && wrapper && wrapperRect) {
                const header = kind === "trigger"
                    ? (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-folder-header]")
                    : null;

                if (header && wrapper.contains(header)) {
                    dropFolder = header.dataset.folderHeader!;
                    target = { folderId: dropFolder, beforeId: null };
                } else {
                    // A folder's slots are indented, so a pointer left of them means the outer list
                    const score = (slot: Slot) => Math.abs(slot.y - e.clientY) + (e.clientX < slot.left ? 24 : 0);
                    let best: Slot | null = null;
                    for (const slot of kind === "trigger" ? triggerSlots(wrapper, id) : folderSlots(wrapper, id)) {
                        if (!best || score(slot) < score(best)) best = slot;
                    }
                    if (best && !best.noop) {
                        target = { folderId: best.folderId, beforeId: best.beforeId };
                        indicator = { top: best.y - wrapperRect.top, left: best.left - wrapperRect.left, width: best.width };
                    }
                }
            }

            setDrag(prev => prev && {
                ...prev,
                pointerClientX: e.clientX,
                pointerClientY: e.clientY,
                target,
                dropFolder,
                indicator,
            });
        };

        const finishDrag = () => {
            setDrag(prev => {
                if (prev?.target) {
                    if (prev.kind === "trigger") moveTrigger(prev.id, prev.target.folderId, prev.target.beforeId);
                    else moveFolder(prev.id, prev.target.beforeId);
                }
                return null;
            });
        };

        // The ghost ignores the pointer, so the grabbing cursor is forced on the whole page while dragging
        document.body.classList.add("vc-sora-grabbing");
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", finishDrag);
        window.addEventListener("pointercancel", finishDrag);
        return () => {
            document.body.classList.remove("vc-sora-grabbing");
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", finishDrag);
            window.removeEventListener("pointercancel", finishDrag);
        };
    }, [drag?.kind, drag?.id]);

    const openMoreMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="vc-sora-triggers-more" onClose={ContextMenuApi.closeContextMenu} aria-label="Trigger options">
                <Menu.MenuItem id="vc-sora-triggers-new-folder" label="New folder" action={() => openFolderEditor()} />
                <Menu.MenuSeparator />
                <Menu.MenuItem id="vc-sora-triggers-import-file" label="Import from file" action={() => importRef.current?.click()} />
                <Menu.MenuItem
                    id="vc-sora-triggers-import-defaults"
                    label={showDefaultsNudge && changeCount > 0
                        ? (
                            <span className="vc-sora-menu-pill-label">
                                <span style={{ flex: 1 }}>Import default triggers</span>
                                <span className="vc-sora-menu-pill">{changeCount} new</span>
                            </span>
                        )
                        : "Import default triggers"}
                    action={openDefaultsPicker}
                />
                <Menu.MenuSeparator />
                <Menu.MenuItem id="vc-sora-triggers-export" label="Export" disabled={!triggers.length} action={handleExport} />
                {isDeveloper() && <Menu.MenuItem id="vc-sora-triggers-safe-export" label="Safe export" disabled={!triggers.length} action={handlePublicExport} />}
                <Menu.MenuSeparator />
                <Menu.MenuItem
                    id="vc-sora-triggers-delete-all"
                    label="Delete all triggers"
                    color="danger"
                    disabled={!triggers.length}
                    leadingAccessory={{ type: "icon", icon: DeleteIcon }}
                    action={() => confirmDeleteAll(triggers.length)}
                />
            </Menu.Menu>
        ));
    };

    useTourAction("triggers.openMoreMenu", () => {
        if (moreBtnRef.current) openMoreMenu(fakeMouseEvent(moreBtnRef.current));
    });
    useTourAction("triggers.closeMoreMenu", () => ContextMenuApi.closeContextMenu());
    useTourAction("triggers.importDefaults", importDefaults);

    const activeType = typeFilter === "all" ? null : TYPE_META[typeFilter];
    const draggedTrigger = drag?.kind === "trigger" ? triggers.find(t => t.id === drag.id) : undefined;
    const draggedFolder = drag?.kind === "folder" ? folders.find(f => f.id === drag.id) : undefined;

    // Place of each card in the whole list, for the entry stagger and the tour anchors
    let position = 0;
    const renderCard = (t: Trigger, list: Trigger[], i: number, folder?: TriggerFolder, first = i === 0, last = i === list.length - 1) => (
        <TriggerCard
            key={t.id}
            trigger={t}
            position={position++}
            tourTarget={t.id === tourCard}
            isFirst={first}
            isLast={last}
            folderPaused={!!folder?.paused}
            orderingDisabled={orderingDisabled}
            useButtonsForOrdering={useButtonsForOrdering}
            useContextMenu={useContextMenu}
            shiftHeld={shiftHeld}
            isDragging={drag?.kind === "trigger" && drag.id === t.id}
            onMoveUp={() => moveWithinGroup(folder ? list : [t], folder ? i : 0, -1)}
            onMoveDown={() => moveWithinGroup(folder ? list : [t], folder ? i : 0, 1)}
            onDragStart={(e, rect) => startDrag("trigger", t.id, e, rect)}
        />
    );

    return (
        <div ref={wrapperRef} className="vc-sora-triggers-tab">
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="vc-sora-triggers-bar">
                    <div style={{ flex: 1, minWidth: 0 }} {...tourAnchor("triggers.search")}>
                        <QuerySearchInput
                            value={search}
                            onChange={handleSearchChange}
                            placeholder="Search triggers"
                            describe={describeQueryTerm}
                            isNegation={isNegatedWord}
                            suffix={narrowed ? `${filtered.length} of ${triggers.length}` : undefined}
                        />
                    </div>
                    <button
                        type="button"
                        className={`vc-sora-triggers-sbtn${activeType ? " active" : ""}`}
                        style={activeType ? { "--sora-c": activeType.color } as React.CSSProperties : undefined}
                        onClick={e => openTypeFilterMenu(e, triggers, typeFilter, handleTypeFilterChange, handleSearchChange)}
                    >
                        <FilterIcon />
                        {activeType?.label ?? "All types"}
                    </button>
                    <div className="vc-sora-nudge-anchor">
                        <Tooltip text="More options">
                            {props => (
                                <button {...props} ref={moreBtnRef} {...tourAnchor("triggers.more")} type="button" aria-label="More options" className={`vc-sora-triggers-sbtn${showNudge ? " vc-sora-nudged" : ""}`} style={{ padding: "0 11px" }} onClick={openMoreMenu}>
                                    <MoreIcon />
                                </button>
                            )}
                        </Tooltip>
                        {showNudge && <>
                            <span className="vc-sora-nudge-dot" />
                            <DefaultsNudge changes={defaultChanges} onDismiss={markDefaultsSeen} onOpen={openDefaultsPicker} />
                        </>}
                    </div>
                    <TourAnchor id="triggers.new"><Button size="medium" variant="positive" onClick={openAddTriggerModal}>+ New</Button></TourAnchor>
                </div>
                <span className="vc-sora-triggers-hint" {...tourAnchor("triggers.hint")}>
                    Filter with <code>enabled:</code> <code>join:</code> <code>notify:</code> <code>lock:</code> <code>hidden:</code> <code>priority:&gt;5</code> <code>folder:</code>
                </span>
                <JoinLockBanner />
            </div>

            <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ScrollerThin className="vc-sora-triggers-scroller" style={{ flex: 1, minHeight: 0 }}>
                {top.length === 0
                    ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", minHeight: 200, color: COLORS.muted }} {...tourAnchor(triggers.length === 0 ? "triggers.empty" : undefined)}>
                            <Paragraph size="sm">
                                {triggers.length === 0
                                    ? "No triggers yet. Create one, or import some from the ⋯ menu."
                                    : "No triggers match your search."}
                            </Paragraph>
                        </div>
                    )
                    : (
                        <div className={`vc-sora-triggers-list${settled ? " settled" : ""}`}>
                            <div className="vc-sora-trigger-group" data-trigger-group="">
                                {top.map((item, idx) => {
                                    // Outside folders, ▲▼ walk the mixed list, so first and last are taken from it
                                    if (item.kind === "trigger") return renderCard(item.trigger, [], 0, undefined, idx === 0, idx === top.length - 1);
                                    const { folder, triggers: list } = item;
                                    const open = isOpen(folder);
                                    return (
                                        <div
                                            key={folder.id}
                                            data-folder-section={folder.id}
                                            className={`vc-sora-folder${drag?.kind === "folder" && drag.id === folder.id ? " dragging" : ""}`}
                                            style={{ "--sora-fc": folder.color } as React.CSSProperties}
                                        >
                                            <FolderHeader
                                                folder={folder}
                                                tourId={folder.id === tourFolder ? "triggers.firstFolder" : undefined}
                                                alwaysShowCount={alwaysShowFolderCount}
                                                count={countFor(folder)}
                                                open={open}
                                                isDropTarget={drag?.dropFolder === folder.id}
                                                canDrag={!orderingDisabled && !useButtonsForOrdering}
                                                onToggle={narrowed ? undefined : () => updateFolder(folder.id, { collapsed: !folder.collapsed })}
                                                onDragStart={(e, rect) => startDrag("folder", folder.id, e, rect)}
                                            />
                                            {/* Always mounted so opening and closing can slide. Closed, it can't be focused or dropped into. */}
                                            <div className={`vc-sora-folder-collapse${open ? " open" : ""}`}>
                                                <div className="vc-sora-folder-collapse-inner">
                                                    <div className="vc-sora-folder-body vc-sora-trigger-group" data-trigger-group={folder.id} data-closed={open ? undefined : ""}>
                                                        {list.length ? list.map((t, i) => renderCard(t, list, i, folder)) : <div className="vc-sora-folder-empty">Drag triggers here.</div>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )
                }
            </ScrollerThin>
            </div>

            {/* Where the dragged trigger or folder will land */}
            {drag?.indicator && (
                <div style={{
                    position: "absolute",
                    top: drag.indicator.top - 1.5,
                    left: drag.indicator.left,
                    width: drag.indicator.width,
                    height: 3,
                    borderRadius: 2,
                    background: "var(--green-360, #23a55a)",
                    pointerEvents: "none",
                    zIndex: 30,
                }} />
            )}

            {/* Drag preview, portaled to <body> so the modal doesn't clip it */}
            {drag && (draggedTrigger || draggedFolder) && ReactDOM.createPortal(
            <div style={{
                position: "fixed",
                top: drag.pointerClientY - drag.grabOffsetY,
                left: drag.pointerClientX - drag.grabOffsetX,
                width: drag.width,
                borderRadius: 8,
                boxShadow: "0 12px 28px rgba(0, 0, 0, 0.45)",
                opacity: 0.96,
                pointerEvents: "none",
                zIndex: 9999,
            }}>
                {draggedTrigger ? <DragGhost trigger={draggedTrigger} /> : <FolderDragGhost folder={draggedFolder!} />}
            </div>,
            document.body
            )}

            <input
                ref={importRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={handleImport}
            />
        </div>
    );
}
