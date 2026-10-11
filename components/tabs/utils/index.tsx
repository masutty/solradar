/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, ButtonVariant } from "@components/Button";
import { PluginNative } from "@utils/types";
import { React, showToast } from "@webpack/common";

import { closeGame, emulatorJoinLink, goToHome, joinLink, prepareAdb } from "../../../services/RobloxService";
import { settings } from "../../../settings";
import { isDeveloper } from "../../../utils";
import { openActiveChannelsModal } from "../../modals/ActiveChannelsModal";
import { Note } from "../../ui/Note";
import { labelText, rowCard, sectionTitle, tabColumn } from "../../ui/styles";
import { HelpTip, TechBadge } from "../settings/Setting";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;

// --- Pieces ---

type Result = { ok: boolean; error?: string; };

function toastResult(result: Result, success: string, failure: string) {
    if (result.ok) showToast(success, "success");
    else showToast(`${failure}: ${result.error}`, "failure");
}

function ActionRow({ label, description, button, variant = "secondary", disabled, onClick }: {
    label: string;
    description: string;
    button: string;
    variant?: ButtonVariant;
    disabled?: boolean;
    onClick: () => unknown;
}) {
    const [busy, setBusy] = React.useState(false);

    const run = async () => {
        setBusy(true);
        try {
            await onClick();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={rowCard}>
            <span style={{ ...labelText, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {label}
                <HelpTip text={description} />
            </span>
            <Button size="small" variant={variant} disabled={disabled || busy} onClick={run}>
                {button}
            </Button>
        </div>
    );
}

// --- UtilsTab ---

export function UtilsTab() {
    const { privateServerLink } = settings.use(["privateServerLink"]);
    const hasLink = Boolean(privateServerLink?.trim());

    const adbArgs = () => [settings.store.ldpAdbPath, settings.store.ldpAdbDeviceSerial, settings.store.ldpAdbPackageName] as const;

    return (
        <div style={tabColumn}>
            {!hasLink && (
                <Note variant="warning" style={{ marginTop: 4 }}>
                    Set your private server link in Settings to use the join buttons.
                </Note>
            )}

            <p style={sectionTitle}>Roblox</p>
            <ActionRow
                label="Join your private server"
                description="Closes Roblox, then opens your private server."
                button="Join"
                variant="primary"
                disabled={!hasLink}
                onClick={async () => {
                    await closeGame({ graceful: true });
                    await joinLink(privateServerLink);
                }}
            />
            <ActionRow
                label="Open the Roblox home page"
                description="Launches Roblox on the home screen."
                button="Open"
                onClick={() => goToHome()}
            />

            <p style={{ ...sectionTitle, display: "flex", alignItems: "center", gap: 6 }}>
                Emulator (ADB) <TechBadge />
            </p>
            <ActionRow
                label="Join your private server on the emulator"
                description="Opens your private server inside the emulator through ADB."
                button="Join"
                disabled={!hasLink}
                onClick={async () => toastResult(await emulatorJoinLink(privateServerLink), "Join started", "Couldn't join")}
            />
            <ActionRow
                label="Prepare ADB"
                description="Opens the home page on PC and your private server on the emulator, ready for ADB joins."
                button="Prepare"
                onClick={async () => toastResult(await prepareAdb(hasLink ? privateServerLink : undefined), "ADB prepared", "Something went wrong")}
            />
            <ActionRow
                label="Close Roblox on the emulator"
                description="Sends the close signal right now."
                button="Close"
                variant="dangerPrimary"
                onClick={async () => toastResult(await Native.closeRobloxOnEmulator(...adbArgs()), "Close signal sent", "Couldn't send the close signal")}
            />
            {isDeveloper() && (
                <ActionRow
                    label="Kill the ADB server"
                    description="Developer only. Stops adb.exe so it restarts on the next command."
                    button="Kill"
                    variant="dangerPrimary"
                    onClick={async () => toastResult(await Native.killAdbServer(settings.store.ldpAdbPath), "ADB server killed", "Couldn't kill the ADB server")}
                />
            )}

            <p style={sectionTitle}>Monitoring</p>
            <ActionRow
                label="Active channels"
                description="Channels where SolRadar saw messages since it started. Not every channel Discord sends you shows up here."
                button="Open"
                onClick={openActiveChannelsModal}
            />
        </div>
    );
}
