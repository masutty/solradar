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
import { React, ScrollerThin, Tooltip, useState } from "@webpack/common";

import { addTrigger, deleteTrigger, makeDefaultTrigger, safeExportDraft, Trigger, updateTrigger } from "../../../../stores/TriggerStore";
import { showToast } from "../../../../utils";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../../ui/LegacyModal";
import { COLORS } from "../../../ui/styles";
import { TechBadge } from "../../settings/Setting";
import { confirmWebhookThenRun } from "../exportActions";
import { Draft, EditorSection, missingEssentials, SECTIONS, TriggerIcon, TYPE_META } from "./sections";

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
                <button {...props} type="button" aria-label={tooltip} className={`vc-sora-editor-iconbtn${danger ? " danger" : ""}`} onClick={onClick}>
                    {children}
                </button>
            )}
        </Tooltip>
    );
}

function NavButton({ section, draft, active, onSelect }: { section: EditorSection; draft: Draft; active: boolean; onSelect: () => void; }) {
    const missing = section.id === "essentials" ? missingEssentials(draft) : [];
    return (
        <button type="button" className={`vc-sora-editor-navbtn${active ? " active" : ""}`} onClick={onSelect} aria-current={active}>
            <span className="label">{section.label}</span>
            {missing.length > 0 && (
                <Tooltip text={`Still needs ${missing.join(" and ")}.`}>
                    {props => <span {...props} className="vc-sora-editor-warn">!</span>}
                </Tooltip>
            )}
            {section.configured(draft) && (
                <Tooltip text="Configured">
                    {props => <span {...props} className="vc-sora-editor-dot" />}
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
            showToast(isEditing ? `Trigger "${draft.name}" updated!` : "Trigger added!", "success");
            modalProps.onClose();
        } catch (error) {
            showToast(`Failed to save trigger: ${error}`, "failure");
        }
    };

    const handleDelete = async () => {
        if (!isEditing) return;
        try {
            await deleteTrigger(trigger.id);
            showToast("Trigger deleted.", "message");
        } catch (error) {
            showToast(`Failed to delete trigger: ${error}`, "failure");
        }
        modalProps.onClose();
    };

    const handleCopy = () => {
        if (!isEditing) return;
        confirmWebhookThenRun([trigger], () => {
            try {
                const { id, ...rest } = trigger;
                navigator.clipboard.writeText(JSON.stringify([rest], null, 2));
                showToast("Trigger copied to clipboard!", "success");
            } catch (e) {
                showToast(`Failed to copy trigger: ${e}`, "failure");
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
            showToast("Trigger exported (safe)!", "success");
        } catch (e) {
            showToast(`Failed to export trigger: ${e}`, "failure");
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
                    </div>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent style={{ padding: 0, overflow: "hidden" }}>
                <div className="vc-sora-editor-body">
                    <nav className="vc-sora-editor-nav vc-sora-thin-scroll">
                        {groups.map(([group, title]) => (
                            <React.Fragment key={group}>
                                <div className="vc-sora-editor-navgroup">{title}</div>
                                {visible.filter(s => s.group === group).map(s => (
                                    <NavButton key={s.id} section={s} draft={draft} active={s.id === active.id} onSelect={() => setActiveId(s.id)} />
                                ))}
                            </React.Fragment>
                        ))}
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
                    <Button size="small" variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                    {isValid
                        ? <Button size="small" variant="positive" onClick={handleSave}>{isEditing ? "Save" : "Create"}</Button>
                        : (
                            <Tooltip text="Give the trigger a name first.">
                                {props => <span {...props}><Button size="small" variant="positive" disabled>{isEditing ? "Save" : "Create"}</Button></span>}
                            </Tooltip>
                        )}
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

export const openAddTriggerModal = () => openModal(p => <TriggerEditor modalProps={p} />);
export const openEditTriggerModal = (t: Trigger) => openModal(p => <TriggerEditor modalProps={p} trigger={t} />);
