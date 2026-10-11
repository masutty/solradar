/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./EditableActionButton.css";

import { Button, ButtonSize } from "@components/Button";
import { Heading } from "@components/Heading";
import { React, TextInput } from "@webpack/common";

import { UIState } from "../../stores/UIStateStore";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "./LegacyModal";

// --- Types ---

export interface EditableActionButtonProps {
    /** Unique and stable, used as the storage key (e.g. "prepareAdb-uri"). */
    id: string;
    /** Default label. The user can override it. */
    defaultLabel: string;
    /** Default value. The user can override it. */
    defaultValue?: string;
    /** Placeholder for the value field in the edit modal. */
    placeholder?: string;
    /** Called on click with the current value (custom or default). */
    onAction: (value: string | undefined) => void;
    size?: ButtonSize;
}

// --- Edit modal ---

interface EditModalProps {
    modalProps: ModalProps;
    defaultLabel: string;
    defaultValue: string | undefined;
    placeholder: string;
    currentLabel: string | undefined;
    currentValue: string | undefined;
    onSave: (label: string | undefined, value: string | undefined) => void;
}

function EditModal({
    modalProps,
    defaultLabel,
    defaultValue,
    placeholder,
    currentLabel,
    currentValue,
    onSave,
}: EditModalProps) {
    const [draftLabel, setDraftLabel] = React.useState(currentLabel ?? "");
    const [draftValue, setDraftValue] = React.useState(currentValue ?? "");

    const handleSave = () => {
        onSave(
            draftLabel.trim() === "" ? undefined : draftLabel.trim(),
            draftValue.trim() === "" ? undefined : draftValue.trim(),
        );
        modalProps.onClose();
    };

    const handleReset = () => {
        setDraftLabel("");
        setDraftValue("");
    };

    const hasChanges = draftLabel.trim() !== "" || draftValue.trim() !== "";

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Heading tag="h2">Edit button</Heading>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent>
                <div className="vc-sora-eab-modal-content">

                    {/* Label */}
                    <div className="vc-sora-eab-field">
                        <span className="vc-sora-eab-field-label">Button label</span>
                        <div className="vc-sora-eab-preview">
                            <span className="vc-sora-eab-preview-label">default</span>
                            <span className="vc-sora-eab-preview-value">{defaultLabel}</span>
                        </div>
                        <TextInput
                            type="text"
                            value={draftLabel}
                            placeholder={defaultLabel}
                            onChange={(v: string) => setDraftLabel(v)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") modalProps.onClose();
                            }}
                            autoFocus
                        />
                    </div>

                    <div className="vc-sora-eab-divider" />

                    {/* Value */}
                    <div className="vc-sora-eab-field">
                        <span className="vc-sora-eab-field-label">Parameter value</span>
                        {defaultValue && (
                            <div className="vc-sora-eab-preview">
                                <span className="vc-sora-eab-preview-label">default</span>
                                <span className="vc-sora-eab-preview-value">{defaultValue}</span>
                            </div>
                        )}
                        <TextInput
                            type="text"
                            value={draftValue}
                            placeholder={placeholder}
                            onChange={(v: string) => setDraftValue(v)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") modalProps.onClose();
                            }}
                        />
                    </div>

                    <p className="vc-sora-eab-modal-hint">
                        Leave a field empty to keep its default value.
                    </p>

                </div>
            </ModalContent>

            <ModalFooter>
                <div className="vc-sora-eab-modal-footer">
                    {(currentLabel !== undefined || currentValue !== undefined) && (
                        <Button
                            variant="dangerSecondary"
                            size="small"
                            onClick={handleReset}
                        >
                            Reset all
                        </Button>
                    )}
                    <Button
                        variant="dangerPrimary"
                        size="small"
                        onClick={modalProps.onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="positive"
                        size="small"
                        onClick={handleSave}
                    >
                        Save
                    </Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

// --- Main component ---

export function EditableActionButton({
    id,
    defaultLabel,
    defaultValue,
    placeholder = "Enter value...",
    onAction,
    size = "small",
}: EditableActionButtonProps) {
    const init = UIState.getEab(id);
    const [customLabel, setCustomLabel] = React.useState<string | undefined>(init.label);
    const [customValue, setCustomValue] = React.useState<string | undefined>(init.value);

    const effectiveLabel = customLabel ?? defaultLabel;
    const effectiveValue = customValue ?? defaultValue;
    const hasCustom = customLabel !== undefined || customValue !== undefined;

    const handleSave = (label: string | undefined, value: string | undefined) => {
        UIState.setEab(id, { label, value });
        setCustomLabel(label);
        setCustomValue(value);
    };

    const handleRightClick = (e: React.MouseEvent) => {
        e.preventDefault();
        openModal(p => (
            <EditModal
                modalProps={p}
                defaultLabel={defaultLabel}
                defaultValue={defaultValue}
                placeholder={placeholder}
                currentLabel={customLabel}
                currentValue={customValue}
                onSave={handleSave}
            />
        ));
    };

    return (
        <div className="vc-sora-eab-wrapper">
            <Button
                size={size}
                variant="secondary"
                onClick={() => onAction(effectiveValue)}
                onContextMenu={handleRightClick}
            >
                {effectiveLabel}
            </Button>

            {/* Dot: blue when customized, gray when all defaults */}
            <span
                className={`vc-sora-eab-indicator ${hasCustom ? "vc-sora-eab-indicator-custom" : "vc-sora-eab-indicator-default"}`}
                title={hasCustom
                    ? `Custom label: "${customLabel ?? defaultLabel}" | Value: ${customValue ?? defaultValue ?? "default"}`
                    : "Using all default values"
                }
            />
        </div>
    );
}
