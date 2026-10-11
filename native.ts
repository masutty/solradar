/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
 * This file contains logic derived from or inspired by the project cresqnt-sys/MultiScope.
 * Portions of the biome detection logic may include translations, adaptations,
 * reinterpretations, or reimplementations of the original Python implementation.
 *
 * Original commit hash: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79 (AGPL-3.0-or-later)
 * Source File referenced: 94f1f06114a3e7cbff64e5fd0bf31ced99b0af79/detection.py
 *
 * This derivative work is distributed under the terms of the
 * GNU Affero General Public License version 3 (AGPL-3.0).
 */

import { Logger } from "@utils/Logger";
import { exec as execCb, spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const logger = new Logger("SolRadar.Native");

const exec = promisify(execCb);

// --- Public types ---

export type ProcessInfo = {
    pid: number;
    name: string;
    path: string;
};

export type ResolvedShareLink =
    | { ok: true; placeId: string; serverId: string; ownerId: string; isValid: boolean; updatedToken: string | null; }
    | { ok: false; status: number; error: string; };

/** A Roblox log file. Defined here to avoid a circular import with BiomeDetector. */
export interface LogEntry {
    path: string;
    account: string | null;
    lastModified: number;
}


// --- Webhooks ---

export async function sendWebhook(_: IpcMainInvokeEvent, url: string, body: string): Promise<void> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

// --- Roblox: open URI ---

/** Opens a `roblox://` or `roblox-player://` deeplink with `start ""`. Windows only. */
export async function openUri(_: IpcMainInvokeEvent, uri: string): Promise<void> {
    if (process.platform !== "win32") {
        throw new Error("openUri only works on Windows.");
    }
    if (!uri || typeof uri !== "string") {
        throw new Error("Invalid argument: uri must be a non-empty string.");
    }

    try {
        // The URI goes into a shell command, so only pass URIs built by the plugin.
        await exec(`start "" "${uri}"`);
    } catch (error) {
        throw new Error(`Failed to open URI "${uri}": ${(error as Error).message}`);
    }
}

// --- Roblox: resolve share link ---

/**
 * Resolves a Roblox share code to its placeId and serverId.
 * Makes two requests: the first only fetches a CSRF token (it always answers 403), the second resolves the link.
 */
export async function resolveShareLink(
    _: IpcMainInvokeEvent,
    token: string,
    shareCode: string
): Promise<ResolvedShareLink> {
    const RESOLVE_URL = "https://apis.roblox.com/sharelinks/v1/resolve-link";
    const headers = (csrf?: string) => ({
        "Cookie": `.ROBLOSECURITY=${token}`,
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-TOKEN": csrf } : {}),
    });

    function extractUpdatedToken(response: Response): string | null {
        const setCookies = response.headers.getSetCookie?.() ??
            [response.headers.get("set-cookie")].filter(Boolean) as string[];

        for (const cookie of setCookies) {
            const match = cookie.match(/\.ROBLOSECURITY=([^;]+)/);
            if (match && match[1] !== token) return match[1];
        }
        return null;
    }

    try {
        // Step 1: get the CSRF token
        const csrfRes = await fetch(RESOLVE_URL, {
            method: "POST",
            headers: headers(),
        });

        const csrf = csrfRes.headers.get("x-csrf-token");
        if (!csrf) {
            return { ok: false, status: csrfRes.status, error: "CSRF token not returned by server." };
        }

        const updatedToken = extractUpdatedToken(csrfRes);

        // Step 2: resolve the link
        const resolveRes = await fetch(RESOLVE_URL, {
            method: "POST",
            headers: headers(csrf),
            body: JSON.stringify({ linkId: shareCode, linkType: "Server" }),
        });

        const updatedTokenFromResolve = extractUpdatedToken(resolveRes);

        if (!resolveRes.ok) {
            return { ok: false, status: resolveRes.status, error: `Resolve request failed with HTTP ${resolveRes.status}.` };
        }

        const data = await resolveRes.json().catch(() => null);
        if (!data || typeof data !== "object") {
            return { ok: false, status: resolveRes.status, error: "Invalid JSON in resolve response." };
        }

        // The field location changed between Roblox API versions, so try both
        const placeId: string | undefined =
            data?.privateServerInviteData?.placeId?.toString() ??
            data?.placeId?.toString();
        logger.debug(`[${shareCode}] Place ID: ${placeId}`);

        const serverId: string | undefined =
            data?.privateServerInviteData?.instanceId ??
            data?.instanceId ??
            data?.privateServerInviteData?.privateServerId;
        logger.debug(`[${shareCode}] Server ID: ${serverId}`);

        const ownerId: string | undefined = data?.privateServerInviteData?.ownerUserId?.toString();
        logger.debug(`[${shareCode}] Owner ID: ${ownerId}`);

        const isValid: boolean | undefined = data?.privateServerInviteData?.status === "Valid";
        logger.debug(`[${shareCode}] Valid: ${isValid}`);

        if (!placeId || !serverId || !ownerId || !isValid) {
            return { ok: false, status: resolveRes.status, error: `placeId: ${placeId}, serverId: ${serverId}, ownerId: ${ownerId}, isValid: ${isValid} | Unexpected response shape: ${JSON.stringify(data)}` };
        }

        return { ok: true, placeId, serverId, ownerId, isValid, updatedToken: updatedTokenFromResolve ?? updatedToken ?? null };

    } catch (error) {
        return { ok: false, status: -1, error: (error as Error).message };
    }
}

// --- Processes ---

type ProcessLookupTarget =
    | { type: "tasklist"; processName: string; }
    | { type: "wmic"; processName: string; }
    | { type: "windowtitle"; windowTitle: string; };

export async function getProcess(
    _: IpcMainInvokeEvent,
    target: ProcessLookupTarget
): Promise<ProcessInfo[]> {
    if (process.platform !== "win32") {
        throw new Error("getProcess only works on Windows.");
    }

    if (target.type === "windowtitle") {
        const { windowTitle } = target;
        if (!windowTitle || typeof windowTitle !== "string") {
            throw new Error("Invalid argument: windowTitle must be a non-empty string.");
        }
        // Match by window title for script macros (e.g. AutoHotkey) that share one interpreter process.
        const { stdout } = await exec(
            `tasklist /FI "WINDOWTITLE eq ${windowTitle}" /FO CSV /NH`
        );
        return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
            const [name, pid] = line.split(/","/).map(s => s.replace(/"/g, "").trim());
            return { pid: Number(pid), name, path: "" };
        });
    }

    const { type, processName } = target;
    if (!processName || typeof processName !== "string") {
        throw new Error("Invalid argument: processName must be a non-empty string.");
    }

    if (type === "tasklist") {
        const { stdout } = await exec(
            `tasklist /FI "IMAGENAME eq ${processName}" /FO CSV /NH`
        );
        return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
            const [name, pid] = line.split(/","/).map(s => s.replace(/"/g, "").trim());
            return { pid: Number(pid), name, path: "" };
        });
    }

    if (type === "wmic") {
        const { stdout } = await exec(
            `wmic process where "name='${processName}'" get ProcessId,ExecutablePath /FORMAT:CSV`
        );
        return stdout.trim().split(/\r?\n/).slice(2).flatMap(line => {
            if (!line.trim()) return [];
            const parts = line.split(",");
            const pid = Number(parts[2]);
            if (!pid) return [];
            return [{ pid, name: processName, path: parts[1] ?? "" }];
        });
    }

    throw new Error(`Unknown process lookup type: ${type}`);
}

export async function killProcess(
    _: IpcMainInvokeEvent,
    target: { pid: number; } | { pname: string; } | { windowTitle: string; }
): Promise<{ ok: boolean; error?: string; }> {
    if (process.platform !== "win32") return { ok: false, error: "Windows only." };

    const command = "pid" in target
        ? `taskkill /PID ${target.pid} /F`
        : "pname" in target
            ? `taskkill /IM "${target.pname}" /F`
            // /FI alone selects and kills every process matching the filter
            : `taskkill /FI "WINDOWTITLE eq ${target.windowTitle}" /F`;

    try {
        await exec(command);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function gracefullyKillProcess(
    _: IpcMainInvokeEvent,
    target: { pid: number } | { pname: string },
    timeoutMs: number = 3000
): Promise<void> {
    if (process.platform !== "win32") return;

    const softCommand = "pid" in target
        ? `taskkill /PID ${target.pid}`
        : `taskkill /IM "${target.pname}"`;

    const hardCommand = "pid" in target
        ? `taskkill /PID ${target.pid} /F`
        : `taskkill /IM "${target.pname}" /F`;

    try {
        await exec(softCommand);
    } catch {
        return; // already gone
    }

    await new Promise(resolve => setTimeout(resolve, timeoutMs));

    // Force-kill if it is still alive
    try {
        const checkCommand = "pid" in target
            ? `tasklist /FI "PID eq ${target.pid}" /NH`
            : `tasklist /FI "IMAGENAME eq ${(target as { pname: string }).pname}" /NH`;

        const { stdout } = await exec(checkCommand);
        const isAlive = stdout.trim().length > 0 && !stdout.includes("No tasks");

        if (isAlive) {
            await exec(hardCommand).catch(() => { });
        }
    } catch { } // tasklist fails when the process is already gone
}

export async function closeRobloxOnEmulator(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    packageName: string = "com.roblox.client"
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }

    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }

    try {
        // These values come from settings and go straight into a shell command
        await exec(`"${adbPath}" -s ${deviceSerial} shell am force-stop ${packageName}`);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function emulatorOpenUri(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    uri: string
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }

    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }

    try {
        // The URI runs in the device shell, so only pass URIs built by the plugin
        const proc = spawn(adbPath, [
            "-s", deviceSerial,
            "shell",
            "am", "start",
            "-a", "android.intent.action.VIEW",
            "-d", `'${uri}'`,
            "com.roblox.client"
        ], {
            shell: false
        });

        return await new Promise(resolve => {
            proc.on("exit", code => {
                if (code === 0) resolve({ ok: true });
                else resolve({ ok: false, error: `Exit code ${code}` });
            });

            proc.on("error", err => {
                resolve({ ok: false, error: err.message });
            });
        });

    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function listAdbDevices(
    _: IpcMainInvokeEvent,
    adbPath: string
): Promise<{ ok: true; output: string; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }
    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }
    try {
        const { stdout } = await exec(`"${adbPath}" devices`);
        return { ok: true, output: stdout.trim() };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function killAdbServer(
    _: IpcMainInvokeEvent,
    adbPath: string
): Promise<{ ok: true; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }
    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }
    try {
        await exec(`"${adbPath}" kill-server`);
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

// --- Biome detection ---
// Used by BiomeDetector, but lives here because it needs Node's fs.

const ROBLOX_LOGS_DIR = path.join(os.homedir(), "AppData", "Local", "Roblox", "logs");
const LOG_TAIL_READ_BYTES = 2 * 1024 * 1024; // read on every tick
const LOG_HEAD_READ_BYTES = 1 * 1024 * 1024; // enough to find the userid/username
const LOG_MAX_AGE_S = 7_200; // older logs are ignored

/** Lists recent Roblox logs with the account (userid or username) found in each one. */
export function getRobloxLogs(_: IpcMainInvokeEvent, from: "username" | "userid"): LogEntry[] {
    const nowMs = Date.now();

    let entries: { file: string; mtime: number; }[] = [];

    try {
        entries = fs.readdirSync(ROBLOX_LOGS_DIR).flatMap(f => {
            const full = path.join(ROBLOX_LOGS_DIR, f);
            try {
                const stat = fs.statSync(full);
                if (!stat.isFile()) return [];
                const ageS = (nowMs - stat.mtime.getTime()) / 1000;
                if (ageS > LOG_MAX_AGE_S) return [];
                return [{ file: full, mtime: stat.mtime.getTime() }];
            } catch {
                return [];
            }
        });
    } catch (err) {
        console.error("[SolRadar.Native] Error listing Roblox logs:", err);
        return [];
    }

    entries.sort((a, b) => b.mtime - a.mtime);

    return entries.flatMap(({ file, mtime }) => {
        try {
            const account = from === "userid"
                ? _getUseridFromLog(file)
                : _getUsernameFromLog(file);
            return [{ path: file, account, lastModified: mtime }];
        } catch {
            return [];
        }
    });
}

function _getUsernameFromLog(logPath: string): string | null {
    try {
        const head = _readHead(logPath);
        return head.match(/Players\.([^.]+)\.PlayerGui/)?.[1] ?? null;
    } catch { return null; }
}

function _getUseridFromLog(logPath: string): string | null {
    try {
        const head = _readHead(logPath);
        return head.match(/GameJoinLoadTime[\s\S]*?userid:(\d+),/i)?.[1] ?? null;
    } catch { return null; }
}

function _readHead(logPath: string): string {
    const fd = fs.openSync(logPath, "r");
    const buffer = Buffer.alloc(LOG_HEAD_READ_BYTES);
    const read = fs.readSync(fd, buffer, 0, LOG_HEAD_READ_BYTES, 0);
    fs.closeSync(fd);
    return buffer.slice(0, read).toString("utf8");
}

/**
 * Reads the end of a log and returns:
 * - `rpcs`: BloxstrapRPC lines, oldest first
 * - `disconnects`: timestamps of Client:Disconnect lines
 * - `effectiveDisconnected`: true if the last disconnect happened after the last RPC
 */
export function getRelevantRpcsFromLogTail(
    _: IpcMainInvokeEvent,
    logPath: string,
): {
    rpcs: string[];
    disconnects: string[];
    effectiveDisconnected: boolean;
} {
    const empty = { rpcs: [], disconnects: [], effectiveDisconnected: false };
    if (!fs.existsSync(logPath)) return empty;

    try {
        const { size } = fs.statSync(logPath);
        const readFrom = Math.max(0, size - LOG_TAIL_READ_BYTES);
        const fd = fs.openSync(logPath, "r");
        const buffer = Buffer.alloc(LOG_TAIL_READ_BYTES);
        const bytesRead = fs.readSync(fd, buffer, 0, LOG_TAIL_READ_BYTES, readFrom);
        fs.closeSync(fd);
        const content = buffer.slice(0, bytesRead).toString("utf8");

        // Disconnects
        const disconnects: string[] = [];
        const disconnectRe = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z).*Client:Disconnect/g;
        let m: RegExpExecArray | null;
        while ((m = disconnectRe.exec(content))) disconnects.push(m[1]);
        const lastDisconnectMs = disconnects.length
            ? new Date(disconnects[disconnects.length - 1]).getTime()
            : undefined;

        // RPCs, searched backwards
        const rpcs: string[] = [];
        let searchFrom = content.length;
        while (true) {
            const idx = content.lastIndexOf("[BloxstrapRPC]", searchFrom);
            if (idx === -1) break;
            const lineStart = content.lastIndexOf("\n", idx) + 1;
            const lineEnd = content.indexOf("\n", idx);
            rpcs.unshift(content.substring(lineStart, lineEnd === -1 ? content.length : lineEnd));
            searchFrom = idx - 1;
        }

        let mostRecentRpcMs: number | undefined;
        if (rpcs.length) {
            const ts = rpcs[rpcs.length - 1].match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
            if (ts) mostRecentRpcMs = new Date(ts[1]).getTime();
        }

        const effectiveDisconnected = lastDisconnectMs !== undefined
            && (mostRecentRpcMs === undefined || mostRecentRpcMs <= lastDisconnectMs);

        return { rpcs, disconnects, effectiveDisconnected };
    } catch (err) {
        console.error(`[SolRadar.Native] Error reading log tail ${logPath}:`, err);
        return empty;
    }
}

// --- Roblox API ---

/** Converts Roblox usernames to user IDs. Usernames that are not found map to null. */
export async function robloxUsernamesToUserIds(
    _: IpcMainInvokeEvent,
    usernames: string[]
): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = Object.fromEntries(usernames.map(n => [n, null]));
    if (!usernames.length) return result;

    try {
        const res = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames, excludeBannedUsers: false }),
        });
        const data = await res.json().catch(() => ({ data: [] }));
        for (const entry of (data.data ?? [])) {
            if (entry?.requestedUsername) result[entry.requestedUsername] = entry.id ?? null;
        }
    } catch { }

    return result;
}
