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
import { exec as execCb, execFile as execFileCb, spawn } from "child_process";
import { IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

const logger = new Logger("SolRadar.Native");

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

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

export type LaunchMethod = "direct" | "shell";
export type OpenUriResult = { method: LaunchMethod; fallbackReason?: string; };

// The protocol handler command from the registry, per scheme. The exe path changes on every
// Roblox update, so it is dropped when the exe is gone or a spawn fails.
const handlerCache = new Map<string, string[]>();
const DIRECT_SCHEMES = new Set(["roblox", "roblox-player"]);

/** Splits a Windows command line into arguments, keeping quoted parts together. */
function splitCommandLine(cmd: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cmd))) out.push(m[1] ?? m[2]);
    return out;
}

async function readHandler(scheme: string): Promise<string[] | null> {
    const keys = [
        `HKCU\\Software\\Classes\\${scheme}\\shell\\open\\command`,
        `HKLM\\Software\\Classes\\${scheme}\\shell\\open\\command`,
    ];
    for (const key of keys) {
        try {
            const { stdout } = await execFile("reg", ["query", key, "/ve"], { windowsHide: true, timeout: 3000 });
            // Line looks like: "    (Default)    REG_SZ    "C:\...\RobloxPlayerBeta.exe" %1" (label is localized)
            const value = stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m)?.[1];
            if (!value) continue;
            const expanded = value.replace(/%([^%\d][^%]*)%/g, (all, name) => process.env[name] ?? all);
            const args = splitCommandLine(expanded);
            if (args.length && fs.existsSync(args[0])) return args;
        } catch { }
    }
    return null;
}

async function getHandler(scheme: string): Promise<string[] | null> {
    const cached = handlerCache.get(scheme);
    if (cached && fs.existsSync(cached[0])) return cached;
    handlerCache.delete(scheme);
    const fresh = await readHandler(scheme);
    if (fresh) handlerCache.set(scheme, fresh);
    return fresh;
}

/** Reads the Roblox protocol handler ahead of time, so the first snipe does not pay for it. */
export async function warmLaunchHandler(_: IpcMainInvokeEvent): Promise<string | null> {
    if (process.platform !== "win32") return null;
    const handler = await getHandler("roblox");
    await getHandler("roblox-player");
    return handler?.[0] ?? null;
}

/**
 * Starts the protocol handler exe directly, without cmd.exe and without ShellExecute.
 * Resolves as soon as the process exists. The child is detached so it outlives Discord.
 */
async function spawnHandler(uri: string): Promise<void> {
    const scheme = uri.slice(0, uri.indexOf(":")).toLowerCase();
    const handler = await getHandler(scheme);
    if (!handler) throw new Error(`No handler found for ${scheme}:`);

    const [exe, ...rest] = handler;
    let usedUri = false;
    const args = rest.map(a => {
        if (!a.includes("%1")) return a;
        usedUri = true;
        return a.replace("%1", uri);
    });
    if (!usedUri) args.push(uri);

    await new Promise<void>((resolve, reject) => {
        // No windowsHide: for a GUI app it would start the Roblox window hidden
        const child = spawn(exe, args, { detached: true, stdio: "ignore", cwd: path.dirname(exe) });
        child.once("spawn", () => { child.unref(); resolve(); });
        child.once("error", err => { handlerCache.delete(scheme); reject(err); });
    });
}

/**
 * Opens a `roblox://` or `roblox-player:` deeplink. Windows only.
 * "direct" starts the registered handler exe itself; "shell" uses `start ""` (cmd.exe + ShellExecute).
 * Other schemes (Joinguard https links) always use the shell. "direct" falls back to the shell on failure.
 */
export async function openUri(_: IpcMainInvokeEvent, uri: string, method: LaunchMethod = "shell"): Promise<OpenUriResult> {
    if (process.platform !== "win32") {
        throw new Error("openUri only works on Windows.");
    }
    if (!uri || typeof uri !== "string") {
        throw new Error("Invalid argument: uri must be a non-empty string.");
    }

    let fallbackReason: string | undefined;
    const scheme = uri.slice(0, Math.max(0, uri.indexOf(":"))).toLowerCase();
    if (method === "direct") {
        if (DIRECT_SCHEMES.has(scheme)) {
            try {
                await spawnHandler(uri);
                return { method: "direct" };
            } catch (err) {
                fallbackReason = (err as Error).message;
                logger.warn(`Direct launch failed, using the shell: ${fallbackReason}`);
            }
        } else {
            fallbackReason = `scheme "${scheme}" is not a Roblox deeplink`;
        }
    }

    try {
        // The URI goes into a shell command, so only pass URIs built by the plugin.
        await exec(`start "" "${uri}"`);
        return { method: "shell", fallbackReason };
    } catch (error) {
        throw new Error(`Failed to open URI "${uri}": ${(error as Error).message}`);
    }
}

// --- Discord: background throttling ---

// Discord's own value, saved before the first change so turning the setting off restores it
let discordThrottling: boolean | null = null;

/**
 * awake = true turns off Chromium's background throttling for Discord's window. The renderer
 * (where the plugin reads messages) then stays treated as visible while minimized, so it is not
 * moved to a lower priority. It also keeps Discord rendering, which costs some CPU.
 * awake = false puts back Discord's own value.
 */
export function setKeepDiscordAwake(event: IpcMainInvokeEvent, awake: boolean): { ok: boolean; discordDefault: boolean | null; now: boolean | null; } {
    try {
        const wc = event.sender;
        if (discordThrottling === null) discordThrottling = wc.getBackgroundThrottling();
        wc.setBackgroundThrottling(awake ? false : discordThrottling);
        return { ok: true, discordDefault: discordThrottling, now: wc.getBackgroundThrottling() };
    } catch (err) {
        logger.warn("setKeepDiscordAwake failed:", err);
        return { ok: false, discordDefault: discordThrottling, now: null };
    }
}

// --- Roblox: join timeline from the logs ---

export type RobloxStageName =
    | "processStart" | "deeplink" | "linkResolved" | "dmReady" | "serverAssigned" | "connected" | "snapshot";

export type RobloxJoinTimeline = {
    ok: true;
    file: string;
    /** warm: an open Roblox took the link (homepage). cold: a new Roblox started. */
    mode: "warm" | "cold";
    /** Time the helper Roblox process spent before handing the link over (warm only). */
    forwarderMs: number | null;
    stages: Partial<Record<RobloxStageName, number>>;
    /** HTTP requests that took 1s or more between the link and the connection. */
    slowHttp: { at: number; ms: number; url: string; }[];
} | { ok: false; error: string; };

const STAGE_PATTERNS: [RobloxStageName, RegExp][] = [
    ["linkResolved", /\[FLog::SingleSurfaceApp\] launchUGCGame: /],
    ["dmReady", /UgcExperienceController: join: initialized dm/],
    ["serverAssigned", /\[FLog::Output\] ! Joining game/],
    ["connected", /Connection accepted from/],
    ["snapshot", /Join snapshot timer/],
];
const TS_RE = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z)/;
const lineTime = (line: string) => {
    const m = line.match(TS_RE);
    return m ? Date.parse(m[1]) : NaN;
};

function parseTimeline(file: string, content: string, launchedAt: number, windowMs: number): RobloxJoinTimeline | null {
    // The short-lived helper process that only hands the link to an open Roblox
    if (content.includes("NoReload Detector: Deeplinking NoReload") || content.includes("NoReload Detector: App NoReload")) return null;

    const lines = content.split(/\r?\n/);
    const firstTs = lines.map(lineTime).find(t => !Number.isNaN(t));
    if (firstTs === undefined) return null;

    let start = -1;
    let mode: "warm" | "cold" = "warm";
    let forwarderMs: number | null = null;
    const stages: Partial<Record<RobloxStageName, number>> = {};

    // Cold: the log itself was started by this launch
    if (firstTs >= launchedAt - 50 && firstTs <= launchedAt + windowMs) {
        mode = "cold";
        stages.processStart = firstTs;
        start = 0;
    } else {
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (!l.includes("App NoReload receiving deeplink")) continue;
            const t = lineTime(l);
            if (t < launchedAt - 50 || t > launchedAt + windowMs) continue;
            stages.deeplink = t;
            const adj = lines[i - 1]?.match(/remote warm start adjustment: (\d+)/);
            if (adj) forwarderMs = Number(adj[1]);
            start = i + 1;
            break;
        }
    }
    if (start < 0) return null;

    const slowHttp: { at: number; ms: number; url: string; }[] = [];
    // Stop at the next deeplink: a later join belongs to another snipe
    for (let i = start; i < lines.length; i++) {
        const l = lines[i];
        if (i > start && l.includes("App NoReload receiving deeplink")) break;
        for (const [name, re] of STAGE_PATTERNS) {
            if (stages[name] === undefined && re.test(l)) stages[name] = lineTime(l);
        }
        const http = l.match(/HttpResponse\(.*?time:([\d.]+)ms.*?url:\{ "([^"]+)"/);
        if (http && Number(http[1]) >= 1000) slowHttp.push({ at: lineTime(l), ms: Number(http[1]), url: http[2] });
        if (stages.snapshot !== undefined) break;
    }

    return { ok: true, file: path.basename(file), mode, forwarderMs, stages, slowHttp };
}

/**
 * Finds what Roblox logged after a launch at `launchedAt` (epoch ms): when it got the link,
 * resolved it, got a server and connected. Reads the logs written since then.
 */
export async function getRobloxJoinTimeline(_: IpcMainInvokeEvent, launchedAt: number, windowMs = 15_000): Promise<RobloxJoinTimeline> {
    try {
        const names = await fs.promises.readdir(ROBLOX_LOGS_DIR);
        const files: { file: string; mtime: number; }[] = [];
        for (const n of names) {
            if (!/_Player_.*_last\.log$/.test(n) || n.includes("CrashHandler")) continue;
            const full = path.join(ROBLOX_LOGS_DIR, n);
            try {
                const st = await fs.promises.stat(full);
                if (st.mtimeMs >= launchedAt) files.push({ file: full, mtime: st.mtimeMs });
            } catch { }
        }
        // Oldest first: the log that took the link was written before later ones
        files.sort((a, b) => a.mtime - b.mtime);
        for (const { file } of files) {
            const content = await fs.promises.readFile(file, "utf8");
            const result = parseTimeline(file, content, launchedAt, windowMs);
            if (result) return result;
        }
        return { ok: false, error: "No Roblox log has this launch. Logs may have been deleted, or Roblox did not get the link." };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

export async function getRobloxJoinTimelines(e: IpcMainInvokeEvent, launches: number[]): Promise<RobloxJoinTimeline[]> {
    const out: RobloxJoinTimeline[] = [];
    for (const t of launches) out.push(await getRobloxJoinTimeline(e, t));
    return out;
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

// --- Git ---

export type GitCommit = {
    hash: string;
    short: string;
    subject: string;
    body: string;
    author: string;
    /** Unix seconds. */
    date: number;
    /** Tags on this commit, like v1.4.3. */
    tags: string[];
};

export type GitInfo =
    | {
        ok: true;
        branch: string;
        head: string;
        /** Nearest tag and the commits since it, like v1.4.3-5-g1a2b3c4. Just the short hash with no tags. */
        describe: string;
        /** Uncommitted changes in the plugin folder. */
        dirty: boolean;
        /** origin as owner/repo, like masutty/solradar. */
        remote: string;
        /** Commits on HEAD that origin doesn't have. null without an upstream. As of the last fetch. */
        ahead: number | null;
        /** Commits on origin that HEAD doesn't have, newest first. As of the last fetch. */
        missing: GitCommit[];
        commits: GitCommit[];
    }
    | { ok: false; error: string; };

const GIT_TIMEOUT_MS = 5000;
const FIELD = "%x1f";
const RECORD = "%x1e";
const FIELD_CHAR = String.fromCharCode(0x1f);
const RECORD_CHAR = String.fromCharCode(0x1e);

async function git(dir: string, args: string[]): Promise<string> {
    const { stdout } = await execFile("git", ["-C", dir, ...args], { timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    return stdout;
}

// Natives run from <Vencord>/dist, and the plugin is cloned into <Vencord>/src/userplugins/<any folder name>
function findPluginRepo(): string | null {
    const root = path.join(__dirname, "..", "src", "userplugins");
    let names: string[];
    try { names = fs.readdirSync(root); } catch { return null; }
    for (const name of names) {
        const dir = path.join(root, name);
        try {
            if (!fs.existsSync(path.join(dir, ".git"))) continue;
            if (/name:\s*"SolRadar"/.test(fs.readFileSync(path.join(dir, "index.tsx"), "utf8"))) return dir;
        } catch { }
    }
    return null;
}

async function gitLog(dir: string, range: string[]): Promise<GitCommit[]> {
    const out = await git(dir, ["log", ...range, `--format=%H${FIELD}%h${FIELD}%s${FIELD}%b${FIELD}%an${FIELD}%ct${FIELD}%D${RECORD}`]);
    return out.split(RECORD_CHAR).map(r => r.trim()).filter(Boolean).map(r => {
        const [hash, short, subject, body, author, date, refs] = r.split(FIELD_CHAR);
        const tags = refs.split(",").map(x => x.trim()).filter(x => x.startsWith("tag: ")).map(x => x.slice(5));
        return { hash, short, subject, body: body.trim(), author, date: Number(date), tags };
    });
}

/** The plugin's own git state: the commit it runs on and the history around it. */
export async function getGitInfo(_: IpcMainInvokeEvent, limit = 30): Promise<GitInfo> {
    const dir = findPluginRepo();
    if (!dir) return { ok: false, error: "No git folder found for the plugin." };

    try {
        const [head, describe, branch, status, remoteUrl, commits] = await Promise.all([
            git(dir, ["rev-parse", "HEAD"]),
            git(dir, ["describe", "--tags", "--always"]),
            git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]),
            git(dir, ["status", "--porcelain"]),
            git(dir, ["remote", "get-url", "origin"]).catch(() => ""),
            gitLog(dir, [`-n${limit}`]),
        ]);

        // No upstream (a local branch) throws here, which is fine
        let ahead: number | null = null;
        let missing: GitCommit[] = [];
        try {
            ahead = Number((await git(dir, ["rev-list", "--count", "@{u}..HEAD"])).trim());
            missing = await gitLog(dir, [`-n${limit}`, "HEAD..@{u}"]);
        } catch { }

        // Only owner/repo reaches the UI: no host aliases, no credentials
        const remote = remoteUrl.trim().replace(/\.git$/, "").split(/[/:]/).slice(-2).join("/");

        return { ok: true, head: head.trim(), describe: describe.trim(), branch: branch.trim(), dirty: status.trim().length > 0, remote, ahead, missing, commits };
    } catch (e) {
        logger.error("git failed:", e);
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}

/** A longer history for the changelog preview. Empty when git is not available. */
export async function getGitLog(_: IpcMainInvokeEvent, limit = 300): Promise<GitCommit[]> {
    const dir = findPluginRepo();
    if (!dir) return [];
    try { return await gitLog(dir, [`-n${limit}`]); } catch (e) {
        logger.error("git log failed:", e);
        return [];
    }
}
