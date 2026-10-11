/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    CloudUploadIcon,
    CopyIcon,
    DeleteIcon,
    FolderIcon,
    PencilIcon,
    PlusIcon,
    StarFilled,
    StarOutlined,
    UploadIcon,
} from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Alerts, ContextMenuApi, Menu, React, showToast } from "@webpack/common";

import { deleteTrigger, downloadTriggerJson, duplicateTrigger, toggleTrigger,Trigger } from "../../../stores/TriggerStore";
import { isDeveloper } from "../../../utils";
import { confirmWebhookThenRun, copyTriggerToClipboard, openSafeExportDialogForTrigger } from "./exportActions";
import { openEditTriggerModal } from "./TriggerModal";

function confirmRemoveTrigger(trigger: Trigger): void {
    Alerts.show({
        title: "Remove Trigger",
        body: <Paragraph>Are you sure you want to remove "{trigger.name}"? This cannot be undone.</Paragraph>,
        confirmText: "Remove",
        cancelText: "Cancel",
        onConfirm: async () => {
            await deleteTrigger(trigger.id);
            showToast("Trigger removed.", "message");
        },
    });
}

export function openTriggerContextMenu(e: React.MouseEvent, trigger: Trigger): void {
    ContextMenuApi.openContextMenu(e, () => <TriggerContextMenu trigger={trigger} />);
}

function TriggerContextMenu({ trigger }: { trigger: Trigger; }) {
    const toggleIcon = trigger.state.enabled ? StarFilled : StarOutlined;

    return (
        <Menu.Menu
            navId="vc-sora-trigger-context-menu"
            onClose={ContextMenuApi.closeContextMenu}
            aria-label="Trigger Options"
        >
            <Menu.MenuItem
                id="vc-sora-trigger-toggle"
                label={trigger.state.enabled ? "Disable" : "Enable"}
                leadingAccessory={{ type: "icon", icon: toggleIcon }}
                action={() => toggleTrigger(trigger.id)}
            />
            <Menu.MenuItem
                id="vc-sora-trigger-edit"
                label="Edit"
                leadingAccessory={{ type: "icon", icon: PencilIcon }}
                action={() => openEditTriggerModal(trigger)}
            />
            <Menu.MenuItem
                id="vc-sora-trigger-duplicate"
                label="Duplicate"
                leadingAccessory={{ type: "icon", icon: PlusIcon }}
                action={() => duplicateTrigger(trigger.id)}
            />
            <Menu.MenuItem
                id="vc-sora-trigger-export"
                label="Export"
                leadingAccessory={{ type: "icon", icon: UploadIcon }}
            >
                <Menu.MenuItem
                    id="vc-sora-trigger-export-file"
                    label="To file..."
                    leadingAccessory={{ type: "icon", icon: FolderIcon }}
                    action={() => confirmWebhookThenRun([trigger], () => downloadTriggerJson(trigger))}
                />
                <Menu.MenuItem
                    id="vc-sora-trigger-export-clipboard"
                    label="To clipboard"
                    leadingAccessory={{ type: "icon", icon: CopyIcon }}
                    action={() => confirmWebhookThenRun([trigger], () => copyTriggerToClipboard(trigger))}
                />
                {isDeveloper() && (
                    <Menu.MenuItem
                        id="vc-sora-trigger-export-safe"
                        label="To file (safe)..."
                        leadingAccessory={{ type: "icon", icon: CloudUploadIcon }}
                        action={() => openSafeExportDialogForTrigger(trigger)}
                    />
                )}
            </Menu.MenuItem>
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-sora-trigger-remove"
                label="Remove"
                color="danger"
                leadingAccessory={{ type: "icon", icon: DeleteIcon }}
                action={() => confirmRemoveTrigger(trigger)}
            />
        </Menu.Menu>
    );
}
