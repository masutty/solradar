/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    CloudUploadIcon,
    CopyIcon,
    DeleteIcon,
    EyeIcon,
    FolderIcon,
    PencilIcon,
    PlusIcon,
    StarFilled,
    StarOutlined,
    UploadIcon,
} from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Alerts, ContextMenuApi, Menu, React, showToast } from "@webpack/common";

import { deleteTrigger, downloadTriggerJson, duplicateTrigger, toggleTrigger, Trigger, updateTrigger } from "../../../stores/TriggerStore";
import { isDeveloper } from "../../../utils";
import { confirmWebhookThenRun, copyTriggerToClipboard, openSafeExportDialogForTrigger } from "./exportActions";
import { openEditTriggerModal } from "./TriggerModal";

// Same shape as the built-in icons: the menu passes props such as color to the svg, and the strokes follow currentColor
function EyeOffIcon({ width = 24, height = 24, ...svgProps }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg {...svgProps} width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6C3.7 8.5 2 12 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            <path d="M14.1 14.2a3 3 0 1 1-4.2-4.2" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

function confirmRemoveTrigger(trigger: Trigger): void {
    Alerts.show({
        title: "Remove Trigger",
        body: <Paragraph>Are you sure you want to remove "{trigger.name}"? This cannot be undone.</Paragraph>,
        confirmText: "Remove",
        cancelText: "Cancel",
        onConfirm: async () => {
            await deleteTrigger(trigger.id);
            showToast({ text: "Trigger removed." });
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
                id="vc-sora-trigger-hide"
                label={trigger.hidden ? "Unhide" : "Hide from list"}
                leadingAccessory={{ type: "icon", icon: trigger.hidden ? EyeIcon : EyeOffIcon }}
                action={() => updateTrigger(trigger.id, { hidden: !trigger.hidden })}
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
