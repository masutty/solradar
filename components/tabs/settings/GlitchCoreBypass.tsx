/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/modal.css";

import { Button } from "@components/Button";
import { FormSwitch } from "@components/FormSwitch";
import { React } from "@webpack/common";

import { settings } from "../../../settings";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../ui/LegacyModal";
import { Note } from "../../ui/Note";
import { TechBadge } from "./Setting";

const WARNING = "If your snipes come in often, this many clicks could look like abuse to Discord and put your account at risk";

function ConfirmModal({ modalProps }: { modalProps: ModalProps; }) {
    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader className="vc-sora-modal-header">
                <span style={{ flex: 1, fontSize: 18, fontWeight: 600, color: "var(--text-default)" }}>Remove click limits?</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent style={{ padding: "16px 16px 20px", color: "var(--text-default)", fontSize: 14, lineHeight: 1.5 }}>
                Glitch Core buttons will be clicked as fast as they arrive. {WARNING}.
            </ModalContent>
            <ModalFooter className="vc-sora-modal-footer">
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
                    <Button
                        size="small"
                        variant="dangerPrimary"
                        onClick={() => {
                            settings.store.glitchCoreBypassClickLimits = true;
                            modalProps.onClose();
                        }}
                    >
                        Remove limits
                    </Button>
                    <Button size="small" variant="primary" autoFocus onClick={modalProps.onClose}>Keep limits</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

/** The switch for glitchCoreBypassClickLimits. Turning it on asks first, so it is not a plain Setting row. */
export function GlitchCoreBypassSetting() {
    const on = settings.use(["glitchCoreBypassClickLimits"]).glitchCoreBypassClickLimits;

    return (
        <div data-sora-setting="glitchCoreBypassClickLimits" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 8, background: "var(--background-mod-subtle)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", color: "var(--control-secondary-text-default)", fontSize: 14, fontWeight: 500 }}>
                        Remove Glitch Core click limits (not recommended)
                        <TechBadge />
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>Clicks every Glitch Core button with no limits.</span>
                </div>
                <FormSwitch
                    title=""
                    value={!!on}
                    hideBorder
                    onChange={v => {
                        if (v) openModal(props => <ConfirmModal modalProps={props} />);
                        else settings.store.glitchCoreBypassClickLimits = false;
                    }}
                />
            </div>
            {on && <Note variant="danger">{WARNING}</Note>}
        </div>
    );
}
