/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type ChipKind = "user" | "channel" | "guild" | "role";

export type RowState =
    | "ok"
    | "checking"
    | "notLoaded" // not in Discord's memory, a lookup can tell more
    | "notInServer"
    | "deleted"
    | "noAccess"
    | "notFound"; // a role that no server of yours has

export interface RowView {
    id: string;
    kind: ChipKind;
    state: RowState;
    /** null when nothing is known about the ID */
    name: string | null;
    /** muted text next to the name: the server, for channels and roles */
    sub?: string;
    /** extra tooltip line, e.g. @username for users */
    detail?: string;
    iconUrl?: string;
    /** role color, used for the role dot */
    color?: string;
}

export const BAD_STATES: ReadonlySet<RowState> = new Set(["notInServer", "deleted", "noAccess", "notFound"]);

export const NOUN: Record<ChipKind, string> = { guild: "server", channel: "channel", user: "user", role: "role" };
