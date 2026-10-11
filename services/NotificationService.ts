/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { Snipe } from "../models/Snipe";
import { settings } from "../settings";
import { SnipeStore } from "../stores/SnipeStore";
import { playAudio } from "../utils";
import { joinUri } from "./RobloxService";

export function canNotify(snipe: Snipe): boolean {
    if (!settings.store.notificationEnabled) return false;
    if (!snipe.trigger.state.notify) return false;
    return true;
}

function playNotificationSound(snipe: Snipe): void {
    const { notificationSound, notificationSoundVolume } = snipe.trigger.state;
    if (!notificationSound) return;

    const rawDelay = settings.store.customNotificationSoundDelay;
    const delay = Number.isFinite(+rawDelay) ? Math.max(0, +rawDelay) : 0;

    snipe.logInfo(`Playing custom notification sound${delay ? ` (delay: ${delay}ms)` : ""}...`);

    const play = () => playAudio(notificationSound, notificationSoundVolume);

    if (delay > 0) {
        setTimeout(play, delay);
    } else {
        play();
    }
}

export function notify(snipe: Snipe): void {
    const entry = SnipeStore.getById(snipe.id)!;
    const tags = new Set(entry.tags);
    const onClick = entry.joinUri
        ? () => joinUri(entry.joinUri)
        : undefined;

    if (tags.has("link-verified-unsafe")) {
        showNotification({
            title: `⚠️ SoRa :: ${snipe.trigger.name} :: Unsafe link!`,
            body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
            icon: snipe.trigger.iconUrl,
            onClick,
        });
        snipe.logWarn("Notification sent - unsafe link.");
        return;
    }

    if (tags.has("failed")) {
        showNotification({
            title: `❌ SoRa :: Failed - ${snipe.trigger.name}`,
            body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
            icon: snipe.trigger.iconUrl,
        });
        snipe.logWarn("Notification sent - join failed.");
        return;
    }

    showNotification({
        title: entry.joinUri
            ? `🎯 SoRa :: Sniped ${snipe.trigger.name}!`
            : `✅ SoRa :: Matched ${snipe.trigger.name}!`,
        body: `In: "${snipe.channel.name}" ("${snipe.guild.name}")`,
        icon: snipe.trigger.iconUrl,
        onClick,
    });
    snipe.logInfo("Notification sent.");
    playNotificationSound(snipe);
}
