/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

import { Logger } from "../logger";
import { SnipeStore } from "../stores/SnipeStore";
import { triggerStoreReady } from "../stores/TriggerStore";
import { Native, PLUGIN_VERSION } from "../utils";

const logger = new Logger("SolRadar:Backup");

const TRIGGERS_KEY = "SolsRadar_Triggers";
const SNIPES_KEY = "solsRadar_snipeHistory";
const BACKUP_KEYS = [TRIGGERS_KEY, "SolsRadar_TriggerFolders", SNIPES_KEY, "SolsRadar_Icons", "SolsRadar_knownNames"];

// The native side only writes when the newest backup is 6 hours old, so this just has to check often enough
const CHECK_EVERY_MS = 60 * 60 * 1000;
const OUTDATED = "Fully restart Discord (quit from the tray) to load the backup code.";

export interface BackupFile {
    version: 1;
    createdAt: number;
    pluginVersion: string;
    data: Record<string, unknown>;
}

let timer: ReturnType<typeof setInterval> | undefined;
let active = false;

const count = (value: unknown) => Array.isArray(value) ? value.length : 0;

export function backupCounts(backup: BackupFile) {
    return { triggers: count(backup.data[TRIGGERS_KEY]), snipes: count(backup.data[SNIPES_KEY]) };
}

/** Saves a backup of the plugin's data. An empty state (no triggers) is skipped unless `force`, so a wipe never replaces good backups. */
export async function backupNow(force = false): Promise<boolean> {
    if (typeof Native.writeBackup !== "function") throw new Error(OUTDATED);

    const data: Record<string, unknown> = {};
    for (const key of BACKUP_KEYS) {
        const value = await DataStore.get(key);
        if (value !== undefined) data[key] = value;
    }
    if (!force && !count(data[TRIGGERS_KEY])) return false;

    const backup: BackupFile = { version: 1, createdAt: Date.now(), pluginVersion: PLUGIN_VERSION, data };
    return await Native.writeBackup(JSON.stringify(backup), force);
}

async function backupQuietly() {
    try {
        if (await backupNow()) logger.info("Backup saved");
    } catch (err) {
        logger.error("Backup failed:", err);
    }
}

export async function startAutoBackup() {
    active = true;
    await Promise.all([triggerStoreReady, SnipeStore.ready]);
    if (!active) return;

    void backupQuietly();
    timer = setInterval(backupQuietly, CHECK_EVERY_MS);
}

export function stopAutoBackup() {
    active = false;
    clearInterval(timer);
    timer = undefined;
}

/** The backup files, newest first. Files that are not a backup are left out. */
export async function loadBackups(): Promise<{ file: string; backup: BackupFile; }[]> {
    if (typeof Native.readBackups !== "function") throw new Error(OUTDATED);

    const out: { file: string; backup: BackupFile; }[] = [];
    for (const { file, text } of await Native.readBackups()) {
        try {
            const backup = JSON.parse(text) as BackupFile;
            if (backup.version === 1 && backup.data && typeof backup.createdAt === "number") out.push({ file, backup });
        } catch (err) {
            logger.warn(`Skipping ${file}:`, err);
        }
    }
    return out;
}

/** Backs up the current data first, writes the backup's keys back and reloads Discord. */
export async function restoreBackup(backup: BackupFile) {
    await backupNow(true);
    for (const key of BACKUP_KEYS) {
        if (key in backup.data) await DataStore.set(key, backup.data[key]);
    }
    location.reload();
}
