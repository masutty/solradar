/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./editor.css";
import "../triggers.css";
import "../../../ui/scrollbar.css";
import "../../../ui/modal.css";

import { Button } from "@components/Button";
import { CopyIcon, DeleteIcon } from "@components/Icons";
import { React, ScrollerThin, Tooltip, useEffect, useState } from "@webpack/common";

import { emitTourSignal, useTourAction } from "../../../../stores/TourStore";
import { addTrigger, deleteTrigger, makeDefaultTrigger, safeExportDraft, Trigger, updateTrigger, withInlineIcon } from "../../../../stores/TriggerStore";
import { showToast } from "../../../../utils";
import { HeaderActions } from "../../../tour/ReplayTourButton";
import { TourAnchor } from "../../../tour/TourAnchor";
import { useAutoTour } from "../../../tour/useAutoTour";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../../ui/LegacyModal";
import { COLORS } from "../../../ui/styles";
import { TechBadge } from "../../settings/Setting";
import { confirmWebhookThenRun } from "../exportActions";
import { setEditorClosing } from "./forwardEditor";
import { Draft, EditorSection, hasBiomeCheck, missingEssentials, SECTIONS, TriggerIcon, TriggerIdLine, TYPE_META } from "./sections";

function DownloadIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
    );
}

function IconButton({ tooltip, danger, onClick, children }: { tooltip: string; danger?: boolean; onClick: () => void; children: React.ReactNode; }) {
    return (
        <Tooltip text={tooltip}>
            {props => (
                <Button {...props} size="small" variant={danger ? "dangerSecondary" : "secondary"} style={{ minWidth: 30, width: 30, padding: 0 }} aria-label={tooltip} onClick={onClick}>
                    {children}
                </Button>
            )}
        </Tooltip>
    );
}

function NavButton({ section, draft, active, onSelect }: { section: EditorSection; draft: Draft; active: boolean; onSelect: () => void; }) {
    const missing = section.id === "essentials" ? missingEssentials(draft) : [];
    const summary = section.summary(draft);
    return (
        <button type="button" className={`vc-sora-editor-navbtn${active ? " active" : ""}`} onClick={onSelect} aria-current={active}>
            <span className="label">{section.label}</span>
            {missing.length > 0 && (
                <Tooltip text={`Still needs ${missing.join(" and ")}.`}>
                    {props => <span {...props} className="vc-sora-editor-warn">!</span>}
                </Tooltip>
            )}
            {summary && (
                <Tooltip text={summary}>
                    {props => (
                        <span {...props} className="vc-sora-editor-set" aria-label={summary}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 12.5l5 5 10-11" /></svg>
                        </span>
                    )}
                </Tooltip>
            )}
        </button>
    );
}

// --- Modal ---

function TriggerEditor({ modalProps, trigger }: { modalProps: ModalProps; trigger?: Trigger; }) {
    const isEditing = trigger !== undefined;
    const [draft, setDraft] = useState<Draft>(trigger ? (({ id, ...rest }) => rest)(trigger) : makeDefaultTrigger("BIOME"));
    const [activeId, setActiveId] = useState("essentials");
    useTourAction("editor.showSection", (id: string) => setActiveId(id));
    // The preview beside the modal plays its own exit when the modal starts closing (transition states: 2 and up)
    useEffect(() => { setEditorClosing(modalProps.transitionState >= 2); }, [modalProps.transitionState]);
    useEffect(() => () => setEditorClosing(false), []);
    useTourAction("editor.hasBiomeCheck", () => hasBiomeCheck(draft.type));
    useEffect(() => {
        emitTourSignal("editor:opened");
        return () => emitTourSignal("editor:closed");
    }, []);
    useAutoTour("editor");

    const patch = (p: Partial<Draft>) => setDraft(prev => ({ ...prev, ...p }));
    const isValid = draft.name.trim().length > 0;

    const visible = SECTIONS.filter(s => s.visible(draft));
    const active = visible.find(s => s.id === activeId) ?? visible[0];
    const meta = TYPE_META[draft.type];

    const handleSave = async () => {
        if (!isValid) return;
        try {
            if (isEditing) await updateTrigger(trigger.id, draft);
            else await addTrigger(draft);
            showToast({ text: isEditing ? `Trigger "${draft.name}" updated!` : "Trigger added!", variant: "success" });
            modalProps.onClose();
        } catch (error) {
            showToast({ text: `Failed to save trigger: ${error}`, variant: "critical" });
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        try {
            await deleteTrigger(trigger.id);
            showToast({ text: "Trigger deleted." });
        } catch (error) {
            showToast({ text: `Failed to delete trigger: ${error}`, variant: "critical" });
        }
        modalProps.onClose();
    };

    const handleCopy = () => {
        if (!isEditing) return;
        confirmWebhookThenRun([trigger], () => {
            try {
                const { id, ...rest } = trigger;
                navigator.clipboard.writeText(JSON.stringify([withInlineIcon(rest)], null, 2));
                showToast({ text: "Trigger copied to clipboard!", variant: "success" });
            } catch (e) {
                showToast({ text: `Failed to copy trigger: ${e}`, variant: "critical" });
            }
        });
    };

    const handleSafeExport = () => {
        try {
            const sanitized = safeExportDraft(draft);
            const blob = new Blob([JSON.stringify([sanitized], null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `solsradar-trigger-${draft.name.trim().replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast({ text: "Trigger exported (safe)!", variant: "success" });
        } catch (e) {
            showToast({ text: `Failed to export trigger: ${e}`, variant: "critical" });
        }
    };

    const groups: [EditorSection["group"], string][] = [["required", "Required"], ["optional", "Optional"]];

    return (
        <ModalRoot {...modalProps} size={ModalSize.LARGE}>
            <ModalHeader className="vc-sora-modal-header vc-sora-modal-header-tall">
                <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", minWidth: 0 }}>
                    <TriggerIcon draft={draft} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {draft.name.trim() || (isEditing ? "Untitled trigger" : "New trigger")}
                            </span>
                            <span className="vc-sora-trigger-type" style={{ "--sora-c": meta.color } as React.CSSProperties}>{meta.label}</span>
                        </div>
                        {trigger && <TriggerIdLine id={trigger.id} />}
                    </div>
                    <HeaderActions tourId="editor" onClose={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent style={{ padding: 0, overflow: "hidden" }}>
                <div className="vc-sora-editor-body">
                    <nav className="vc-sora-editor-nav vc-sora-thin-scroll">
                        {groups.map(([group]) => {
                            const items = (
                                <>
                                    {group === "optional" && <div className="vc-sora-editor-navsep" role="separator" />}
                                    {visible.filter(s => s.group === group).map(s => (
                                        <NavButton key={s.id} section={s} draft={draft} active={s.id === active.id} onSelect={() => setActiveId(s.id)} />
                                    ))}
                                </>
                            );
                            return group === "optional"
                                ? <TourAnchor key={group} id="editor.optionalNav">{items}</TourAnchor>
                                : <React.Fragment key={group}>{items}</React.Fragment>;
                        })}
                    </nav>
                    <ScrollerThin key={active.id} className="vc-sora-editor-content">
                        <div className="vc-sora-editor-page">
                            <h2 className="vc-sora-editor-pagetitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {active.label}
                                {active.tech && <TechBadge />}
                            </h2>
                            <active.Component draft={draft} patch={patch} />
                        </div>
                    </ScrollerThin>
                </div>
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
                    {isEditing && <>
                        <IconButton tooltip="Delete trigger" danger onClick={handleDelete}><DeleteIcon width={18} height={18} /></IconButton>
                        <IconButton tooltip="Copy to clipboard" onClick={handleCopy}><CopyIcon width={18} height={18} /></IconButton>
                        <IconButton tooltip="Safe export (without webhooks, filters or bypasses)" onClick={handleSafeExport}><DownloadIcon /></IconButton>
                    </>}
                    <div style={{ flex: 1 }} />
                    <TourAnchor id="editor.save">
                        <Button size="small" variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                        {isValid
                            ? <Button size="small" variant="positive" onClick={handleSave}>{isEditing ? "Save" : "Create"}</Button>
                            : (
                                <Tooltip text="Give the trigger a name first.">
                                    {props => <span {...props}><Button size="small" variant="positive" disabled>{isEditing ? "Save" : "Create"}</Button></span>}
                                </Tooltip>
                            )}
                    </TourAnchor>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export const openAddTriggerModal = () => openModal(p => <TriggerEditor modalProps={p} />);
export const openEditTriggerModal = (t: Trigger) => openModal(p => <TriggerEditor modalProps={p} trigger={t} />);
