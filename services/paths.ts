/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// No Discord or Node imports: used by both native.ts and the renderer.

/** Replaces the Windows user folder in a path, so screenshots and reports don't show the user name. */
export function redactUserPath(p: string): string {
    return p
        .replace(/^[A-Z]:\\Users\\[^\\]+\\AppData\\Local(?=\\|$)/i, "%LOCALAPPDATA%")
        .replace(/^[A-Z]:\\Users\\[^\\]+(?=\\|$)/i, "%USERPROFILE%");
}

/** Whether a path is Roblox's own player, as opposed to another launcher. */
export const isRobloxPlayerExe = (p: string) => /(^|\\)RobloxPlayerBeta\.exe$/i.test(p);
