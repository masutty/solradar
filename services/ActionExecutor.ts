/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { Logger } from "../logger";
import { settings } from "../settings";
import { resolveIcon } from "../stores/IconStore";
import { closeGame, goToHome, joinLink, joinSolsPublicServer, prepareAdb } from "./RobloxService";
import { stopWindowsAutoPlay } from "./WindowsAutoPlay";

const logger = new Logger("SolRadar:Action");

export type UserAction = "nothing" | "public" | "close" | "private" | "home" | "prep-adb";

// --- Pending action ---

export interface PendingActionState {
    title: string;
    description?: string;
    endsAt: number;
    durationMs: number;
}

let _pending: PendingActionState | null = null;
let _cancelFn: (() => void) | null = null;
const _listeners = new Set<(s: PendingActionState | null) => void>();

function _setPending(s: PendingActionState | null): void {
    _pending = s;
    for (const fn of _listeners) { try { fn(s); } catch { } }
}

export const PendingActionStore = {
    get current(): PendingActionState | null { return _pending; },
    msRemaining(): number {
        return _pending ? Math.max(0, _pending.endsAt - Date.now()) : 0;
    },
    subscribe(fn: (s: PendingActionState | null) => void): () => void {
        _listeners.add(fn);
        return () => _listeners.delete(fn);
    },
    cancel(): boolean {
        if (!_pending) return false;
        _cancelFn?.();
        _cancelFn = null;
        _setPending(null);
        logger.info("Pending action cancelled.");
        return true;
    },
};

const ACTION_LABELS: Record<string, string> = {
    nothing: "nothing",
    public: "join a public server",
    close: "close Roblox",
    private: "go to your private server",
    home: "launch Roblox home page",
    "prep-adb": "prepare ADB",
};

export async function executeAction(action: UserAction | string): Promise<void> {
    if (action !== "nothing") {
        logger.info(`Executing: ${ACTION_LABELS[action] ?? action}`);
        // An action means the snipe is over or replaced, so its Play clicking must not carry on into the next game
        stopWindowsAutoPlay(`action: ${ACTION_LABELS[action] ?? action}`);
    }
    switch (action) {
        case "nothing": return;
        case "public": await joinSolsPublicServer(); return;
        case "close": await closeGame(); return;
        case "home": await goToHome(); return;
        case "private": {
            if (!settings.store.privateServerLink.trim()) {
                showNotification({
                    title: "⚠️ SoRa :: Plugin issues!",
                    body: "Action triggered, but no private server link is configured.\nJoining a public server instead.",
                });
                await joinSolsPublicServer();
                return;
            }
            await joinLink(settings.store.privateServerLink);
            return;
        }
        case "prep-adb": {
            if (!settings.store.privateServerLink.trim()) {
                showNotification({
                    title: "⚠️ SoRa :: Plugin issues!",
                    body: "Action triggered, but no private server link is configured.\nJoining a public server instead.",
                });
                await joinSolsPublicServer();
                return;
            }
            await prepareAdb(settings.store.privateServerLink);
            return;
        }
    }
}

export function scheduleCancelableAction({ action, timeoutMs, title, iconUrl, description }: {
    action: UserAction | string;
    timeoutMs: number;
    title: string;
    iconUrl?: string;
    description?: string;
}): void {
    if (action === "nothing") return;

    const label = ACTION_LABELS[action] ?? action;

    // Two actions must never run side by side, so the newer one replaces any pending one
    PendingActionStore.cancel();

    // With no wait there is no time to cancel, so the notification only informs
    if (timeoutMs <= 0) {
        logger.info(`Executing immediately (no delay): ${label}: ${title}`);
        if (settings.store.notifyInstantActions) {
            showNotification({
                title: `⚡ SoRa :: ${title}`,
                body: description ? `${description}\nRunning now: ${label}.` : `Running now: ${label}.`,
                icon: resolveIcon(iconUrl),
            });
        }
        executeAction(action);
        return;
    }

    let cancelled = false;
    const seconds = Math.round(timeoutMs / 1000);
    logger.info(`Scheduled: ${label} in ${seconds}s: ${title}`);

    const timer = setTimeout(() => {
        _cancelFn = null;
        _setPending(null);
        if (!cancelled) executeAction(action);
    }, timeoutMs);

    _cancelFn = () => { cancelled = true; clearTimeout(timer); };
    _setPending({ title, description, endsAt: Date.now() + timeoutMs, durationMs: timeoutMs });

    showNotification({
        title: `⏳ SoRa :: ${title}`,
        body: description
            ? `${description}\nIn ${seconds}s: ${label}. Tap to cancel.`
            : `In ${seconds}s: ${label}. Tap to cancel.`,
        icon: resolveIcon(iconUrl),
        onClick: () => PendingActionStore.cancel(),
    });
}
