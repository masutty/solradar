/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// --- Snipable links ---

export interface RobloxPrivateServerLink {
    type: "private";
    link: string;
    code: string;
    placeId: string;
}

export interface RobloxShareLink {
    type: "share";
    link: string;
    code: string;
}

export interface SSTJoinGuardLink {
    type: "joinguard";
    link: string;
    code: string;
}

export type SnipableLink = RobloxPrivateServerLink | RobloxShareLink | SSTJoinGuardLink;

// --- Versioning ---

export interface ChangelogEntry {
    type: string;
    text: string;
    description?: string;
}

export interface ChangelogVersion {
    version: string;
    entries: ChangelogEntry[];
}

export interface VersionManifest {
    currentVersion: string;
    changelog: ChangelogVersion[];
}

// --- Re-exports ---

export type { SnipeMetrics, SnipeTag } from "./stores/SnipeStore";
export type { Trigger } from "./stores/TriggerStore";
