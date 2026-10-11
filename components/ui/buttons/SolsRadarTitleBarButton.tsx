/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ToastType } from "@vencord/discord-types";
import { findComponentByCodeLazy } from "@webpack";
import { React, showToast, useState } from "@webpack/common";

import { PendingActionStore } from "../../../services/ActionExecutor";
import { settings } from "../../../settings";
import { SolsRadarIcon } from "../../icons/SolsRadarIcon";
import { openSolsRadarModal } from "../../SolsRadarModal";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

setTimeout(() => console.log("[SolRadar] HeaderBarIcon:", HeaderBarIcon), 5000);


const STATE_COLORS = {
    ACTIVE: "#43a25a",
    INACTIVE: "#f04747",
};

interface SolsRadarTitleBarButtonProps {
    className?: string;
}

export function SolsRadarTitleBarButton({ className = "" }: SolsRadarTitleBarButtonProps) {
    const { autoJoinEnabled, notificationEnabled, pluginIconShortcutAction, hideInactiveIndicator } = settings.use([
        "autoJoinEnabled",
        "notificationEnabled",
        "pluginIconShortcutAction",
        "hideInactiveIndicator",
    ]);

    const isActive = autoJoinEnabled;
    const stateText = isActive ? "ACTIVE" : "INACTIVE";
    const [hovered, setHovered] = useState(false);

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
                const newState = !autoJoinEnabled;
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
        <div
            onContextMenu={handleContextMenu}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <HeaderBarIcon
                onClick={handleClick}
                tooltip={`SolRadar (${stateText})`}
                aria-haspopup="dialog"
                icon={() => (
                    <div
                        style={{ position: "relative", display: "inline-block" }}
                    >
                        <SolsRadarIcon
                            height={18}
                            width={18}
                            color={hovered ? "var(--interactive-icon-hover)" : "var(--interactive-icon-default)"}
                        />
                        {(isActive || !hideInactiveIndicator) && (
                            <div style={{
                                position: "absolute",
                                right: 0,
                                bottom: 0,
                                width: 5,
                                height: 5,
                                borderRadius: "50%",
                                backgroundColor: isActive ? STATE_COLORS.ACTIVE : STATE_COLORS.INACTIVE,
                                border: "1.5px solid var(--background-primary)",
                                boxShadow: "0 0 3px rgba(0,0,0,0.3)",
                            }} />
                        )}
                    </div>
                )}
                selected={isActive}
            />
        </div>
    );
}
