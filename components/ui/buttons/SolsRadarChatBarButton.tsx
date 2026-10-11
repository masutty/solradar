/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ToastType } from "@vencord/discord-types";
import { React, showToast } from "@webpack/common";

import { PendingActionStore } from "../../../services/ActionExecutor";
import { settings } from "../../../settings";
import { SolsRadarIcon } from "../../icons/SolsRadarIcon";
import { openSolsRadarModal } from "../../SolsRadarModal";

const STATE_COLORS = {
    ACTIVE: "#43a25a",
    INACTIVE: "#f04747",
};

export const SolsRadarChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const { autoJoinEnabled, notificationEnabled, pluginIconShortcutAction, hideInactiveIndicator } = settings.use([
        "autoJoinEnabled",
        "notificationEnabled",
        "pluginIconShortcutAction",
        "hideInactiveIndicator",
    ]);

    if (!isMainChat || settings.store.pluginIconLocation !== "chatbar") return null;

    const isActive = autoJoinEnabled;

    const handleClick = () => {
        openSolsRadarModal();
    };

    const handleContextMenu = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();

        let message = "No action taken.";
        let toastType: ToastType = "message";

        switch (pluginIconShortcutAction) {
            case "toggle_join":
                const newJoin = !autoJoinEnabled;
                settings.store.autoJoinEnabled = newJoin;
                message = `Auto-join ${newJoin ? "enabled" : "disabled"}!`;
                toastType = newJoin ? "success" : "message";
                break;

            case "toggle_notification":
                const newNotif = !notificationEnabled;
                settings.store.notificationEnabled = newNotif;
                message = `Notifications ${newNotif ? "enabled" : "disabled"}!`;
                toastType = newNotif ? "success" : "message";
                break;

            case "toggle_both":
                const newState = !autoJoinEnabled; // auto-join decides the new state for both
                settings.store.autoJoinEnabled = newState;
                settings.store.notificationEnabled = newState;
                message = `Auto-join and notifications ${newState ? "enabled" : "disabled"}!`;
                toastType = newState ? "success" : "message";
                break;

            default:
                break;
        }

        const cancelled = PendingActionStore.cancel();
        if (cancelled) message += message === "No action taken." ? "Pending action cancelled!" : " + pending action cancelled!";

        if (message !== "No action taken.") {
            showToast(message, toastType);
        }
    };

    return (
        <ChatBarButton
            tooltip={`SolRadar ${isActive ? "(ACTIVE)" : "(INACTIVE)"}`}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            buttonProps={{
                "aria-haspopup": "dialog",
                style: { position: "relative" },
            }}
        >
            <div style={{ position: "relative", display: "inline-block" }}>
                <SolsRadarIcon />

                {/* indicator */}
                {(isActive || !hideInactiveIndicator) && (
                    <div
                        style={{
                            position: "absolute",
                            right: -6,
                            bottom: -6,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            backgroundColor: isActive ? STATE_COLORS.ACTIVE : STATE_COLORS.INACTIVE,
                            border: "1.5px solid var(--background-primary)",
                            boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                            transform: "scale(0.7)",
                        }}
                    />
                )}
            </div>
        </ChatBarButton>
    );
};
