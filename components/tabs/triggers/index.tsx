/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/OrderSlot.css";
import "./triggers.css";

import { Button } from "@components/Button";
import { DeleteIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Alerts, ContextMenuApi, Menu, React, ReactDOM, ScrollerThin, showToast, TextInput, Tooltip, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "../../../settings";
import { emitTourSignal, useTourAction } from "../../../stores/TourStore";
import {
    deleteAllTriggers,
    deleteTrigger,
    downloadTriggersJson,
    downloadTriggersJsonRedacted,
    importTriggersFromJson,
    RedactField,
    reorderTriggers,
    toggleTrigger,
    Trigger,
    TriggerType,
    updateTrigger,
    useTriggers,
} from "../../../stores/TriggerStore";
import { UIState } from "../../../stores/UIStateStore";
import defaultTriggers from "../../../triggers.json";
import { isDeveloper } from "../../../utils";
import { JoinLockBanner } from "../../JoinLockBanner";
import { fakeMouseEvent } from "../../tour/anchors";
import { TourAnchor, tourAnchor } from "../../tour/TourAnchor";
import { useAutoTour } from "../../tour/useAutoTour";
import { DeleteButton } from "../../ui/buttons/DeleteButton";
import { COLORS } from "../../ui/styles";
import { useShiftHeld } from "../../ui/useShiftHeld";
import { TriggerIcon, TYPE_META } from "./editor/sections";
import { confirmWebhookThenRun } from "./exportActions";
import { PublicExportOptions } from "./PublicExportOptions";
import { openTriggerContextMenu } from "./TriggerContextMenu";
import { openAddTriggerModal, openEditTriggerModal } from "./TriggerModal";

// --- Query parser ---

interface ParsedQuery {
    text: string;
    enabled: boolean | null;
    autojoin: boolean | null;
    notify: boolean | null;
    lock: boolean | null;
    priority: { op: "eq" | "gt" | "lt"; value: number; } | null;
}

function parseBool(v: string): boolean | null {
    if (v === "true" || v === "1" || v === "yes") return true;
    if (v === "false" || v === "0" || v === "no") return false;
    return null;
}

/**
 * Parses a query string into structured filters.
 * Supported tokens: enabled: join: notify: lock: priority: (=/>/<)
 * Everything else is treated as free-text search.
 */
function parseQuery(raw: string): ParsedQuery {
    const result: ParsedQuery = {
        text: "", enabled: null, autojoin: null,
        notify: null, lock: null, priority: null,
    };

    const TOKEN_RE = /(\w+):([^\s]+)/g;
    let freeText = raw;
    let match: RegExpExecArray | null;

    while ((match = TOKEN_RE.exec(raw)) !== null) {
        const [full, key, val] = match;
        freeText = freeText.replace(full, "");

        switch (key.toLowerCase()) {
            case "enabled":
                result.enabled = parseBool(val); break;
            case "join":
                result.autojoin = parseBool(val); break;
            case "notify":
                result.notify = parseBool(val); break;
            case "lock":
                result.lock = parseBool(val); break;
            case "priority": {
                const gtMatch = /^>(\d+)$/.exec(val);
                const ltMatch = /^<(\d+)$/.exec(val);
                const eqMatch = /^(\d+)$/.exec(val);
                if (gtMatch) result.priority = { op: "gt", value: parseInt(gtMatch[1]) };
                else if (ltMatch) result.priority = { op: "lt", value: parseInt(ltMatch[1]) };
                else if (eqMatch) result.priority = { op: "eq", value: parseInt(eqMatch[1]) };
                break;
            }
        }
    }

    result.text = freeText.trim().toLowerCase();
    return result;
}

function applyQuery(triggers: Trigger[], q: ParsedQuery, typeFilter: TriggerType | "all"): Trigger[] {
    return triggers.filter(t => {
        if (typeFilter !== "all" && t.type !== typeFilter) return false;

        if (q.enabled !== null && t.state.enabled !== q.enabled) return false;
        if (q.autojoin !== null && t.state.autojoin !== q.autojoin) return false;
        if (q.notify !== null && t.state.notify !== q.notify) return false;
        if (q.lock !== null && t.state.joinlock !== q.lock) return false;

        if (q.priority !== null) {
            const p = t.state.priority;
            if (q.priority.op === "eq" && p !== q.priority.value) return false;
            if (q.priority.op === "gt" && p <= q.priority.value) return false;
            if (q.priority.op === "lt" && p >= q.priority.value) return false;
        }

        if (q.text) {
            const keywords = t.conditions.keywords.match.value.join(" ").toLowerCase();
            const haystack = `${t.name} ${t.description} ${keywords}`.toLowerCase();
            if (!haystack.includes(q.text)) return false;
        }

        return true;
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

function openTypeFilterMenu(e: React.MouseEvent, triggers: Trigger[], current: TypeFilter, onChange: (f: TypeFilter) => void) {
    const options: TypeFilter[] = ["all", ...(Object.keys(TYPE_META) as TriggerType[])];
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-sora-triggers-filter" onClose={ContextMenuApi.closeContextMenu} aria-label="Filter triggers">
            {options.map(type => {
                const count = type === "all" ? triggers.length : triggers.filter(t => t.type === type).length;
                return (
                    <Menu.MenuRadioItem
                        key={type}
                        id={`vc-sora-triggers-filter-${type}`}
                        group="vc-sora-triggers-filter"
                        label={`${type === "all" ? "All types" : TYPE_META[type].label} (${count})`}
                        checked={current === type}
                        action={() => onChange(type)}
                    />
                );
            })}
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

function TriggerCard({
    trigger,
    index,
    position,
    isFirst,
    isLast,
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
    index: number;
    /** Place in the visible list, for the entry stagger */
    position: number;
    isFirst: boolean;
    isLast: boolean;
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
    const subline = trigger.description || (keywords.length ? keywords.join(", ") : "No keywords yet");

    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const setState = (p: Partial<Trigger["state"]>) => updateTrigger(trigger.id, { state: { ...trigger.state, ...p } });

    return (
        <div
            ref={cardRef}
            {...tourAnchor(position === 0 ? "triggers.firstCard" : undefined)}
            data-trigger-index={index}
            className={`vc-sora-trigger-card${enabled ? "" : " off"}${isDragging ? " dragging" : ""}`}
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
                    <button style={s.orderBtn(isFirst)} disabled={isFirst} onClick={onMoveUp} title="Move this card up">▲</button>
                    <button style={s.orderBtn(isLast)} disabled={isLast} onClick={onMoveDown} title="Move this card down">▼</button>
                </div>
            )}

            <Tooltip text={enabled ? "Enabled. Click to disable." : "Disabled. Click to enable."}>
                {props => (
                    <button
                        {...props}
                        {...tourAnchor(position === 0 ? "triggers.firstIcon" : undefined)}
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
                    {props => <span {...props} {...tourAnchor(position === 0 ? "triggers.firstPriority" : undefined)} className="vc-sora-trigger-prio">{joinlock ? "🔒" : "★"} {priority}</span>}
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

// --- Styles ---

const s = {
    orderButtons: {
        display: "flex",
        flexDirection: "column" as const,
        gap: 2,
        flexShrink: 0,
    },
    orderBtn: (disabled: boolean): React.CSSProperties => ({
        background: "none",
        border: "none",
        padding: "1px 4px",
        fontSize: 12,
        lineHeight: 1,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--control-secondary-text-default)" : "var(--text-muted)",
        opacity: disabled ? 0.3 : 1,
        borderRadius: 3,
        transition: "color 0.1s, opacity 0.1s",
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

export function TriggersTab() {
    const triggers = useTriggers();
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
    const { useButtonsForOrderingTriggers: useButtonsForOrdering, useTriggerTabContextMenu: useContextMenu } = settings.use([
        "useButtonsForOrderingTriggers",
        "useTriggerTabContextMenu",
    ]);

    const handleSearchChange = (v: string) => {
        setSearch(v);
        UIState.set("triggers", { search: v });
    };

    const handleTypeFilterChange = (f: TypeFilter) => {
        setTypeFilter(f);
        UIState.set("triggers", { typeFilter: f });
    };

    const filtered = React.useMemo(() => {
        const q = parseQuery(search);
        return applyQuery(triggers, q, typeFilter);
    }, [triggers, search, typeFilter]);

    // Reordering is off while a filter or search narrows the list
    const orderingDisabled = filtered.length !== triggers.length;

    const showImportModeAlert = (json: string) => {
        Alerts.show({
            title: "Import Triggers",
            body: (
                <div style={{ minWidth: "350px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <Paragraph>
                        How would you like to import these triggers?<br /><br />
                        <strong>Add as new</strong> - added alongside your existing ones.<br /><br />
                        <strong>Replace</strong> - current triggers deleted and replaced.
                    </Paragraph>
                    <div style={{ display: "flex", flexDirection: "row", gap: 8, width: "100%" }}>
                        <Button variant="positive" style={{ flex: 1 }} onClick={() => {
                            Alerts.close();
                            importTriggersFromJson(json, "merge").then(result => {
                                if (result.ok) {
                                    showToast({ text: `Imported ${result.imported} trigger(s)!`, variant: "success" });
                                    emitTourSignal("triggers:imported");
                                } else showToast({ text: `Import failed: ${result.error}`, variant: "critical" });
                            });
                        }}>Add as new</Button>
                        <Button variant="dangerPrimary" style={{ flex: 1 }} onClick={() => {
                            Alerts.close();
                            importTriggersFromJson(json, "replace").then(result => {
                                if (result.ok) {
                                    showToast({ text: `Imported ${result.imported} trigger(s)!`, variant: "success" });
                                    emitTourSignal("triggers:imported");
                                } else showToast({ text: `Import failed: ${result.error}`, variant: "critical" });
                            });
                        }}>Replace</Button>
                    </div>
                </div>
            ),
            confirmText: "Cancel",
        });
    };

    // On an empty list "Add as new" and "Replace" are the same, so skip the question
    const importDefaults = async () => {
        if (importingRef.current) return;
        importingRef.current = true;
        try {
            const result = await importTriggersFromJson(JSON.stringify(defaultTriggers), "merge");
            if (result.ok) {
                showToast({ text: `Imported ${result.imported} trigger(s)!`, variant: "success" });
                emitTourSignal("triggers:imported");
            } else showToast({ text: `Import failed: ${result.error}`, variant: "critical" });
        } finally {
            importingRef.current = false;
        }
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        const reader = new FileReader();
        reader.onload = ev => showImportModeAlert(ev.target?.result as string);
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

    const move = (fromIndex: number, toIndex: number) => {
        if (toIndex < 0 || toIndex >= triggers.length) return;
        const newOrder = [...triggers];
        const [moved] = newOrder.splice(fromIndex, 1);
        newOrder.splice(toIndex, 0, moved);
        reorderTriggers(newOrder);
    };

    // `slot`: insert before the item at this index (or at the end when slot === triggers.length),
    // counted before the dragged item is removed.
    const moveToSlot = (fromIndex: number, slot: number) => {
        move(fromIndex, slot > fromIndex ? slot - 1 : slot);
    };

    // --- Drag to reorder ---
    // Uses pointer events because native drag-and-drop is unreliable in Electron
    // (drag image, clipping, tiny hitboxes).
    const [drag, setDrag] = useState<{
        fromIndex: number;
        width: number;
        grabOffsetX: number;
        grabOffsetY: number;
        pointerClientX: number;
        pointerClientY: number;
        targetSlot: number | null;
        indicator: { top: number; left: number; width: number; } | null;
    } | null>(null);

    const startDrag = (fromIndex: number, e: React.PointerEvent, cardRect: DOMRect) => {
        e.preventDefault();
        setDrag({
            fromIndex,
            width: cardRect.width,
            grabOffsetX: e.clientX - cardRect.left,
            grabOffsetY: e.clientY - cardRect.top,
            pointerClientX: e.clientX,
            pointerClientY: e.clientY,
            targetSlot: null,
            indicator: null,
        });
    };

    useEffect(() => {
        if (!drag) return;

        const onMove = (e: PointerEvent) => {
            const containerRect = containerRef.current?.getBoundingClientRect();
            const wrapperRect = wrapperRef.current?.getBoundingClientRect();

            let targetSlot: number | null = null;
            let indicator: NonNullable<typeof drag>["indicator"] = null;

            const nearContainer = containerRect
                && e.clientX >= containerRect.left - 40 && e.clientX <= containerRect.right + 40
                && e.clientY >= containerRect.top - 40 && e.clientY <= containerRect.bottom + 40;

            if (nearContainer && wrapperRect) {
                const rows = Array.from(wrapperRef.current?.querySelectorAll<HTMLElement>("[data-trigger-index]") ?? [])
                    .map(el => ({ idx: Number(el.dataset.triggerIndex), rect: el.getBoundingClientRect() }))
                    .filter(r => !Number.isNaN(r.idx))
                    .sort((a, b) => a.idx - b.idx);

                if (rows.length > 0) {
                    // One Y per insertion slot (N rows give N+1 slots), in the middle of the gap between rows
                    const slotYs = rows.map((r, i) =>
                        i === 0 ? r.rect.top : (rows[i - 1].rect.bottom + r.rect.top) / 2
                    );
                    slotYs.push(rows[rows.length - 1].rect.bottom);

                    let bestSlot = 0;
                    let bestDist = Infinity;
                    slotYs.forEach((y, k) => {
                        const d = Math.abs(e.clientY - y);
                        if (d < bestDist) { bestDist = d; bestSlot = k; }
                    });

                    // Dropping right back next to itself wouldn't actually move anything.
                    const isNoOp = bestSlot === drag.fromIndex || bestSlot === drag.fromIndex + 1;
                    if (!isNoOp) {
                        targetSlot = bestSlot;
                        const row = rows[Math.min(bestSlot, rows.length - 1)];
                        indicator = {
                            top: slotYs[bestSlot] - wrapperRect.top,
                            left: row.rect.left - wrapperRect.left,
                            width: row.rect.width,
                        };
                    }
                }
            }

            setDrag(prev => prev && {
                ...prev,
                pointerClientX: e.clientX,
                pointerClientY: e.clientY,
                targetSlot,
                indicator,
            });
        };

        const finishDrag = () => {
            setDrag(prev => {
                if (prev && prev.targetSlot !== null) {
                    moveToSlot(prev.fromIndex, prev.targetSlot);
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
    }, [drag?.fromIndex]);

    const openMoreMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="vc-sora-triggers-more" onClose={ContextMenuApi.closeContextMenu} aria-label="Trigger options">
                <Menu.MenuItem id="vc-sora-triggers-import-file" label="Import from file" action={() => importRef.current?.click()} />
                <Menu.MenuItem id="vc-sora-triggers-import-defaults" label="Import default triggers" action={() => triggers.length ? showImportModeAlert(JSON.stringify(defaultTriggers)) : importDefaults()} />
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

    return (
        <div ref={wrapperRef} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, gap: 8, position: "relative" }}>
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <div className="vc-sora-triggers-bar">
                    <div style={{ flex: 1, minWidth: 0 }} {...tourAnchor("triggers.search")}>
                        <TextInput value={search} onChange={handleSearchChange} placeholder="Search triggers" />
                    </div>
                    <button
                        type="button"
                        className={`vc-sora-triggers-sbtn${activeType ? " active" : ""}`}
                        style={activeType ? { "--sora-c": activeType.color } as React.CSSProperties : undefined}
                        onClick={e => openTypeFilterMenu(e, triggers, typeFilter, handleTypeFilterChange)}
                    >
                        <FilterIcon />
                        {activeType?.label ?? "All types"}
                    </button>
                    <Tooltip text="More options">
                        {props => (
                            <button {...props} ref={moreBtnRef} {...tourAnchor("triggers.more")} type="button" aria-label="More options" className="vc-sora-triggers-sbtn" style={{ padding: "0 11px" }} onClick={openMoreMenu}>
                                <MoreIcon />
                            </button>
                        )}
                    </Tooltip>
                    <TourAnchor id="triggers.new"><Button size="medium" variant="positive" onClick={openAddTriggerModal}>+ New</Button></TourAnchor>
                </div>
                <span className="vc-sora-triggers-hint" {...tourAnchor("triggers.hint")}>
                    Filter with <code>enabled:</code> <code>join:</code> <code>notify:</code> <code>lock:</code> <code>priority:&gt;5</code>
                    {filtered.length !== triggers.length && <> · showing {filtered.length} of {triggers.length}</>}
                </span>
                <JoinLockBanner />
            </div>

            <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <ScrollerThin style={{ flex: 1, minHeight: 0 }}>
                {filtered.length === 0
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
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 8 }}>
                            {filtered.map((t, i) => {
                                // order buttons need the index in the full list, not the filtered one
                                const realIdx = triggers.indexOf(t);
                                return (
                                    <TriggerCard
                                        key={t.id}
                                        trigger={t}
                                        index={realIdx}
                                        position={i}
                                        isFirst={realIdx === 0}
                                        isLast={realIdx === triggers.length - 1}
                                        orderingDisabled={orderingDisabled}
                                        useButtonsForOrdering={useButtonsForOrdering}
                                        useContextMenu={useContextMenu}
                                        shiftHeld={shiftHeld}
                                        isDragging={drag?.fromIndex === realIdx}
                                        onMoveUp={() => move(realIdx, realIdx - 1)}
                                        onMoveDown={() => move(realIdx, realIdx + 1)}
                                        onDragStart={(e, cardRect) => startDrag(realIdx, e, cardRect)}
                                    />
                                );
                            })}
                        </div>
                    )
                }
            </ScrollerThin>
            </div>

            {/* Where the dragged trigger will land */}
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
            {drag && ReactDOM.createPortal(
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
                <DragGhost trigger={triggers[drag.fromIndex]} />
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
