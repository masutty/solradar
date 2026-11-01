/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ImportPicker.css";

import { Button, TextButton } from "@components/Button";
import { Heading } from "@components/Heading";
import { React, showToast, useMemo, useState } from "@webpack/common";

import { countChanges, DEFAULT_TRIGGERS, DefaultChanges, DefaultTrigger, describeUpdate, isUpdatable, markDefaultsSeen, pendingChanges } from "../../../stores/defaultTriggers";
import { emitTourSignal } from "../../../stores/TourStore";
import { getTriggers, importTriggers, Trigger, updateFromDefaults, useTriggers } from "../../../stores/TriggerStore";
import { HeaderActions } from "../../tour/ReplayTourButton";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../ui/LegacyModal";
import { TriggerIcon, TYPE_META } from "./editor/sections";

// --- Copy ---

const NEW_COLOR = "#3ba55d";
const UPDATED_COLOR = "#00a8fc";

const plural = (n: number) => `${n} trigger${n === 1 ? "" : "s"}`;

export function importSummary(added: number, updated: number): string {
    if (added && updated) return `Added ${plural(added)}, updated ${updated}!`;
    if (updated) return `Updated ${plural(updated)}!`;
    return `Added ${plural(added)}!`;
}

// --- Items ---

type Tag = "new" | "updated" | null;

interface Item {
    trigger: Trigger & { rev?: number; };
    /** The user already has this id */
    have: boolean;
    updatable: boolean;
    /** For an updatable one: what the update changes */
    updateText?: string;
    tag: Tag;
    /** In the change list captured when the picker opened */
    changed: boolean;
}

const isImportable = (i: Item) => !i.have || i.updatable;

function buildItems(source: "defaults" | "file", triggers: Trigger[], mine: Trigger[], changes?: DefaultChanges): Item[] {
    const byId = new Map(mine.map(t => [t.id, t]));
    const newIds = new Set(changes?.added.map(d => d.id));
    const updatedIds = new Set(changes?.updated.map(d => d.id));

    const items = triggers.map((trigger): Item => {
        const own = byId.get(trigger.id);
        const updatable = source === "defaults" && !!own && isUpdatable(own);
        return {
            trigger,
            have: !!own,
            updatable,
            updateText: updatable ? describeUpdate(own!, trigger as DefaultTrigger) : undefined,
            tag: !own && newIds.has(trigger.id) ? "new" : updatable ? "updated" : null,
            changed: newIds.has(trigger.id) || updatedIds.has(trigger.id),
        };
    });

    // Changes first, then the rest in file order, then what the user already has
    const rank = (i: Item) => isImportable(i) ? (i.changed ? 0 : 1) : 2;
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
        .map(x => x.item);
}

// --- Icons ---

function CheckIcon() {
    return (
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </svg>
    );
}

function StarIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c9cdfb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.2 5.6L20 9l-4.5 3.8L17 19l-5-3.2L7 19l1.5-6.2L4 9l5.8-.4Z" />
        </svg>
    );
}

// --- Row ---

function PickerRow({ item, checked, onToggle }: { item: Item; checked: boolean; onToggle: () => void; }) {
    const { trigger, have, updatable, updateText, tag } = item;
    const locked = have && !updatable;
    const meta = TYPE_META[trigger.type];
    const desc = updatable && checked
        ? updateText
        : trigger.description;
    const tagColor = tag === "new" ? NEW_COLOR : UPDATED_COLOR;

    return (
        <button
            type="button"
            className={`vc-sora-ip-card${checked ? " on" : ""}${locked ? " have" : ""}`}
            aria-pressed={checked}
            aria-disabled={locked}
            onClick={() => { if (!locked) onToggle(); }}
        >
            <span className="vc-sora-ip-box">{(checked || locked) && <CheckIcon />}</span>
            <span className="vc-sora-ip-icon"><TriggerIcon draft={trigger} size={38} /></span>
            <span className="vc-sora-ip-main">
                <span className="vc-sora-ip-top">
                    <span className="vc-sora-ip-name">{trigger.name}</span>
                    <span className="vc-sora-trigger-type vc-sora-ip-type" style={{ "--sora-c": meta.color } as React.CSSProperties}>{meta.label}</span>
                </span>
                <span className="vc-sora-ip-desc">
                    <span className="vc-sora-ip-desc-text">{desc}</span>
                    <span className="vc-sora-ip-msg">Already in your list. To delete it, use the trigger list.</span>
                </span>
            </span>
            {tag && (
                <span className="vc-sora-ip-status" style={{ "--sora-c": tagColor } as React.CSSProperties}>
                    {tag === "new" ? "New" : "Updated"}
                </span>
            )}
        </button>
    );
}

// --- Picker ---

interface PickerProps {
    modalProps: ModalProps;
    source: "defaults" | "file";
    triggers: (Trigger & { rev?: number; })[];
    fileName?: string;
    /** Change list captured when the picker opened (defaults only) */
    changes?: DefaultChanges;
}

function ImportPicker({ modalProps, source, triggers, fileName, changes }: PickerProps) {
    const mine = useTriggers();
    const [query, setQuery] = useState("");
    const [show, setShow] = useState<"all" | "can">("all");

    const items = useMemo(() => buildItems(source, triggers, mine, changes), [source, triggers, mine, changes]);
    const importable = items.filter(isImportable);

    // Only decided once, when the picker opens
    const [picked, setPicked] = useState<Set<string>>(() => {
        const start = source === "file"
            ? importable
            : getTriggers().length === 0
                ? importable
                : importable.filter(i => i.changed);
        return new Set(start.map(i => i.trigger.id));
    });

    const changeIds = items.filter(i => i.changed && isImportable(i)).map(i => i.trigger.id);
    const changesTotal = changes ? countChanges(changes) : 0;
    const allChangesPicked = changeIds.every(id => picked.has(id));

    const q = query.trim().toLowerCase();
    const visible = (show === "can" ? importable : items).filter(i => !q
        || i.trigger.name.toLowerCase().includes(q)
        || TYPE_META[i.trigger.type].label.toLowerCase().includes(q)
        || i.trigger.description.toLowerCase().includes(q));

    const toggle = (id: string) => setPicked(prev => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
    });

    const selected = importable.filter(i => picked.has(i.trigger.id));

    const doImport = async () => {
        const toAdd = selected.filter(i => !i.have).map(i => i.trigger);
        const toUpdate = selected.filter(i => i.updatable).map(i => i.trigger.id);
        const added = toAdd.length ? await importTriggers(toAdd) : 0;
        const updated = toUpdate.length ? await updateFromDefaults(toUpdate) : 0;
        showToast({ text: importSummary(added, updated), variant: "success" });
        emitTourSignal("triggers:imported");
        modalProps.onClose();
    };

    const title = source === "defaults" ? "Import default triggers" : "Import from file";
    const placeholder = source === "defaults" ? "Search defaults" : "Search this file";

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="vc-sora-modal-header vc-sora-modal-header-tall">
                <div className="vc-sora-ip-head">
                    <div className="vc-sora-ip-title">
                        {/* Same title and close button as the main modal */}
                        <Heading tag="h2" className="vc-sora-modal-title" style={{ margin: 0 }}>{title}</Heading>
                        {source === "file" && <span className="vc-sora-ip-subtitle">{fileName} · {plural(triggers.length)}</span>}
                    </div>
                    <HeaderActions onClose={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent style={{ padding: 0, overflow: "hidden" }}>
                <div className="vc-sora-ip-body">
                    <div className="vc-sora-ip-tools">
                        <div className="vc-sora-ip-row">
                            <input
                                className="vc-sora-ip-search"
                                aria-label={placeholder}
                                placeholder={placeholder}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                            />
                            <div className="vc-sora-ip-segs" role="group" aria-label="Show">
                                {([["all", "All", items.length], ["can", "Can import", importable.length]] as const).map(([id, label, count]) => (
                                    <button key={id} type="button" className={`vc-sora-ip-seg${show === id ? " on" : ""}`} aria-pressed={show === id} onClick={() => setShow(id)}>
                                        {label} <span>{count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        {source === "defaults" && changesTotal > 0 && (
                            <div className="vc-sora-ip-banner">
                                <StarIcon />
                                <span className="vc-sora-ip-banner-text"><b>{changesTotal} {changesTotal === 1 ? "change" : "changes"}</b> since your last look</span>
                                {allChangesPicked
                                    ? <span className="vc-sora-ip-banner-done">Selected</span>
                                    : <TextButton variant="link" onClick={() => setPicked(prev => new Set([...prev, ...changeIds]))}>Select them</TextButton>}
                            </div>
                        )}
                    </div>

                    <div className="vc-sora-ip-list">
                        {visible.length === 0 && <div className="vc-sora-ip-empty">{source === "defaults" ? "No defaults match." : "Nothing matches."}</div>}
                        {visible.map(item => (
                            <PickerRow key={item.trigger.id} item={item} checked={isImportable(item) && picked.has(item.trigger.id)} onToggle={() => toggle(item.trigger.id)} />
                        ))}
                    </div>
                </div>
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, width: "100%" }}>
                    <Button size="small" variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                    <Button size="small" variant="primary" disabled={selected.length === 0} onClick={doImport}>
                        {selected.length ? `Import ${selected.length}` : "Import"}
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

// --- Openers ---

/** Opens the picker on the defaults. Reading the change list first, then marking it seen. */
export function openDefaultsPicker() {
    const changes = pendingChanges(getTriggers());
    openModal(p => <ImportPicker modalProps={p} source="defaults" triggers={DEFAULT_TRIGGERS} changes={changes} />);
    markDefaultsSeen();
}

export function openFilePicker(triggers: Trigger[], fileName: string) {
    openModal(p => <ImportPicker modalProps={p} source="file" triggers={triggers} fileName={fileName} />);
}
