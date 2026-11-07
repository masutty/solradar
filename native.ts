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
import { ChildProcessWithoutNullStreams, exec as execCb, execFile as execFileCb, spawn } from "child_process";
import { BrowserWindow, dialog, IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from "util";

import { isRobloxPlayerExe, redactUserPath } from "./services/paths";

const logger = new Logger("SolRadar.Native");

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

// --- Public types ---

export type ProcessInfo = {
    pid: number;
    name: string;
    path: string;
};

export type RawShareLink =
    | { ok: true; status: number; statusText: string; headers: Record<string, string>; body: string; updatedToken: string | null; }
    | { ok: false; status: number; error: string; };

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

/** Same as sendWebhook, with a picture attached. The embed can show it as attachment://icon.webp */
export async function sendWebhookWithIcon(_: IpcMainInvokeEvent, url: string, body: string, iconDataUrl: string): Promise<void> {
    const [header, base64] = iconDataUrl.split(",");
    const type = /^data:([^;]+)/.exec(header)?.[1] ?? "image/webp";
    const form = new FormData();
    form.append("payload_json", body);
    form.append("files[0]", new Blob([Buffer.from(base64, "base64")], { type }), "icon.webp");

    const res = await fetch(url, { method: "POST", body: form });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

// --- Roblox: open URI ---

export type LaunchMethod = "direct" | "shell";
export type OpenUriResult = { method: LaunchMethod; fallbackReason?: string; exe?: string; };

/** The program Windows runs for a scheme, and where that came from. */
export interface LaunchHandler {
    scheme: string;
    exe: string;
    args: string[];
    /** The command line as stored in the registry */
    command: string;
    /** Registry key the command was read from */
    key: string;
    /** Set when the user picked an app for this scheme in Windows ("Open with" / Default apps) */
    userChoice?: string;
    /** Set when this scheme had no command and another Roblox scheme's handler is used */
    borrowedFrom?: string;
}

export interface LaunchHandlerReport {
    scheme: string;
    handler: LaunchHandler | null;
    /** Every registry key looked at, in order, with what was found */
    tried: { key: string; result: string; }[];
}

// The protocol handler per scheme. The exe path changes on every Roblox update,
// so it is dropped when the exe is gone or a spawn fails.
const handlerCache = new Map<string, LaunchHandler>();
const DIRECT_SCHEMES = new Set(["roblox", "roblox-player"]);

/** Splits a Windows command line into arguments, keeping quoted parts together. */
function splitCommandLine(cmd: string): string[] {
    const out: string[] = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cmd))) out.push(m[1] ?? m[2]);
    return out;
}

async function regValue(key: string, name?: string): Promise<string | null> {
    try {
        const { stdout } = await execFile("reg", ["query", key, ...(name ? ["/v", name] : ["/ve"])], { windowsHide: true, timeout: 3000 });
        // Line looks like: "    (Default)    REG_SZ    "C:\...\RobloxPlayerBeta.exe" %1" (label is localized)
        return stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m)?.[1] ?? null;
    } catch {
        return null;
    }
}

/**
 * Finds the program Windows opens a scheme with, the way the shell does:
 * the user's choice (UserChoice ProgId) first, then the per-user and machine-wide classes.
 * "roblox" falls back to "roblox-player": some installs register only that one, with the same exe.
 */
async function resolveHandler(scheme: string, tried: LaunchHandlerReport["tried"] = []): Promise<LaunchHandler | null> {
    const choiceKey = `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${scheme}\\UserChoice`;
    const userChoice = await regValue(choiceKey, "ProgId") ?? undefined;
    tried.push({ key: choiceKey, result: userChoice ? `ProgId ${userChoice}` : "none" });

    const progId = userChoice ?? scheme;
    for (const root of ["HKCU", "HKLM"]) {
        const key = `${root}\\Software\\Classes\\${progId}\\shell\\open\\command`;
        const command = await regValue(key);
        if (!command) { tried.push({ key, result: "missing" }); continue; }
        const expanded = command.replace(/%([^%\d][^%]*)%/g, (all, name) => process.env[name] ?? all);
        const [exe, ...args] = splitCommandLine(expanded);
        if (!exe || !fs.existsSync(exe)) { tried.push({ key, result: `exe not found: ${exe ?? "(empty)"}` }); continue; }
        tried.push({ key, result: `ok: ${exe}` });
        return { scheme, exe, args, command, key, userChoice };
    }

    if (scheme === "roblox") {
        const other = await resolveHandler("roblox-player", tried);
        if (other) return { ...other, scheme, borrowedFrom: "roblox-player" };
    }
    return null;
}

async function getHandler(scheme: string): Promise<LaunchHandler | null> {
    const cached = handlerCache.get(scheme);
    if (cached && fs.existsSync(cached.exe)) return cached;
    handlerCache.delete(scheme);
    const fresh = await resolveHandler(scheme);
    if (fresh) handlerCache.set(scheme, fresh);
    return fresh;
}

/** Reads the Roblox protocol handler ahead of time, so the first snipe does not pay for it. */
export async function warmLaunchHandler(_: IpcMainInvokeEvent): Promise<string | null> {
    if (process.platform !== "win32") return null;
    const handler = await getHandler("roblox");
    await getHandler("roblox-player");
    return handler?.exe ?? null;
}

/** Reads the handlers again, without the cache, and says where each one came from. For debugging. */
export async function describeLaunchHandlers(_: IpcMainInvokeEvent): Promise<LaunchHandlerReport[]> {
    if (process.platform !== "win32") return [];
    const out: LaunchHandlerReport[] = [];
    for (const scheme of DIRECT_SCHEMES) {
        const tried: LaunchHandlerReport["tried"] = [];
        out.push({ scheme, handler: await resolveHandler(scheme, tried), tried });
    }
    return out;
}

/** The program shown in Settings: the one Windows uses, or a file the user picked. */
export interface LaunchProgram {
    source: "windows" | "custom";
    exe: string | null;
    /** The path with the Windows user folder replaced, for showing on screen */
    display: string | null;
    found: boolean;
    /** The exe is not Roblox's own player (another launcher) */
    otherLauncher: boolean;
}

/** What Direct launch runs: customExe when set, otherwise the program Windows opens Roblox links with. */
export async function getLaunchProgram(_: IpcMainInvokeEvent, customExe?: string): Promise<LaunchProgram> {
    const exe = customExe || (process.platform === "win32" ? (await resolveHandler("roblox"))?.exe : undefined) || null;
    const found = !!exe && fs.existsSync(exe);
    return {
        source: customExe ? "custom" : "windows",
        exe,
        display: exe && redactUserPath(exe),
        found,
        otherLauncher: found && !isRobloxPlayerExe(exe!),
    };
}

/** Opens Windows' file picker for an exe. Resolves with the path, or null when cancelled. */
export async function pickLaunchExe(event: IpcMainInvokeEvent, startIn?: string): Promise<string | null> {
    const win = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
        title: "Choose the Roblox program",
        defaultPath: startIn,
        properties: ["openFile"],
        filters: [{ name: "Programs", extensions: ["exe"] }],
    };
    const res = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return res.canceled ? null : res.filePaths[0] ?? null;
}

/** Starts an exe detached, without cmd.exe. Resolves as soon as the process exists. */
function spawnDetached(exe: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        // No windowsHide: for a GUI app it would start the Roblox window hidden
        const child = spawn(exe, args, { detached: true, stdio: "ignore", cwd: path.dirname(exe) });
        child.once("spawn", () => { child.unref(); resolve(); });
        child.once("error", reject);
    });
}

/**
 * Starts the protocol handler exe directly, without cmd.exe and without ShellExecute.
 * Resolves with the exe as soon as the process exists. The child is detached so it outlives Discord.
 */
async function spawnHandler(uri: string): Promise<string> {
    const scheme = uri.slice(0, uri.indexOf(":")).toLowerCase();
    const handler = await getHandler(scheme);
    if (!handler) throw new Error(`No handler found for ${scheme}:`);

    const { exe, args: rest } = handler;
    let usedUri = false;
    const args = rest.map(a => {
        if (!a.includes("%1")) return a;
        usedUri = true;
        return a.replace("%1", uri);
    });
    if (!usedUri) args.push(uri);

    try {
        await spawnDetached(exe, args);
    } catch (err) {
        handlerCache.delete(scheme);
        throw err;
    }
    // Re-read the registry off the hot path: after an update the old exe can linger
    setTimeout(() => {
        resolveHandler(scheme).then(h => { if (h) handlerCache.set(scheme, h); }).catch(() => { });
    }, 10_000);
    return exe;
}

/**
 * Opens a `roblox://` or `roblox-player:` deeplink. Windows only.
 * "direct" starts customExe, or the registered handler exe, itself; "shell" uses `start ""` (cmd.exe + ShellExecute).
 * Other schemes (Joinguard https links) always use the shell. "direct" falls back to the shell on failure.
 */
export async function openUri(_: IpcMainInvokeEvent, uri: string, method: LaunchMethod = "shell", customExe?: string): Promise<OpenUriResult> {
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
                if (customExe) {
                    if (!fs.existsSync(customExe)) throw new Error("the file picked in Settings doesn't exist");
                    await spawnDetached(customExe, [uri]);
                    return { method: "direct", exe: customExe };
                }
                return { method: "direct", exe: await spawnHandler(uri) };
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

// --- Roblox: join timeline from the logs ---

export type RobloxStageName =
    | "processStart" | "helperStart" | "deeplink" | "linkResolved" | "dmReady" | "serverAssigned" | "connected" | "snapshot";

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

/**
 * The short-lived helper Roblox that only passes the link to an open Roblox.
 * `start` is when its own clock started (its first log line minus the elapsed time on that line).
 * Anything between the launch and `start` happens before Roblox's code logs anything.
 */
function parseHelper(content: string, birthtimeMs: number): { start: number; sent: number; } | null {
    if (!content.includes("NoReload Detector: Deeplinking NoReload")) return null;
    const lines = content.split(/\r?\n/);
    const first = lines.find(l => TS_RE.test(l));
    const sentLine = lines.find(l => l.includes("NoReload Detector: Deeplinking NoReload"));
    if (!first || !sentLine || !(birthtimeMs > 0)) return null;
    const offset = birthtimeMs - lineTime(first);
    const elapsed = Number(first.split(",")[1]);
    if (!Number.isFinite(elapsed)) return null;
    return { start: Math.round(birthtimeMs - elapsed * 1000), sent: Math.round(lineTime(sentLine) + offset) };
}

/**
 * Roblox writes its log times as "process start, cut to the whole second, plus elapsed time",
 * so a whole log can be off by up to a second. The file is created when the first line is
 * written, so `birthtimeMs - first line time` gives that log's offset (checked: it matches
 * `mtime - last line time` within ~10ms).
 */
function parseTimeline(file: string, content: string, launchedAt: number, windowMs: number, birthtimeMs: number): RobloxJoinTimeline | null {
    // The short-lived helper process that only hands the link to an open Roblox
    if (content.includes("NoReload Detector: Deeplinking NoReload") || content.includes("NoReload Detector: App NoReload")) return null;

    const lines = content.split(/\r?\n/);
    const rawFirst = lines.map(lineTime).find(t => !Number.isNaN(t));
    if (rawFirst === undefined) return null;
    const offset = birthtimeMs > 0 && Math.abs(birthtimeMs - rawFirst) < 2_000 ? Math.round(birthtimeMs - rawFirst) : 0;
    const at = (line: string) => lineTime(line) + offset;
    const firstTs = rawFirst + offset;

    let start = -1;
    let mode: "warm" | "cold" = "warm";
    let forwarderMs: number | null = null;
    const stages: Partial<Record<RobloxStageName, number>> = {};

    // Cold: the log itself was started by this launch
    if (firstTs >= launchedAt - 300 && firstTs <= launchedAt + windowMs) {
        mode = "cold";
        stages.processStart = firstTs;
        start = 0;
    } else {
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (!l.includes("App NoReload receiving deeplink")) continue;
            const t = at(l);
            if (t < launchedAt - 300 || t > launchedAt + windowMs) continue;
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
            if (stages[name] === undefined && re.test(l)) stages[name] = at(l);
        }
        const http = l.match(/HttpResponse\(.*?time:([\d.]+)ms.*?url:\{ "([^"]+)"/);
        if (http && Number(http[1]) >= 1000) slowHttp.push({ at: at(l), ms: Number(http[1]), url: http[2] });
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
        const files: { file: string; mtime: number; birth: number; }[] = [];
        for (const n of names) {
            if (!/_Player_.*_last\.log$/.test(n) || n.includes("CrashHandler")) continue;
            const full = path.join(ROBLOX_LOGS_DIR, n);
            try {
                const st = await fs.promises.stat(full);
                if (st.mtimeMs >= launchedAt) files.push({ file: full, mtime: st.mtimeMs, birth: st.birthtimeMs });
            } catch { }
        }
        // Oldest first: the log that took the link was written before later ones
        files.sort((a, b) => a.mtime - b.mtime);
        const helpers: { start: number; sent: number; }[] = [];
        let result: RobloxJoinTimeline | null = null;
        for (const { file, birth } of files) {
            const content = await fs.promises.readFile(file, "utf8");
            const helper = parseHelper(content, birth);
            if (helper) { helpers.push(helper); continue; }
            result ??= parseTimeline(file, content, launchedAt, windowMs, birth);
        }
        if (result?.ok && result.stages.deeplink !== undefined) {
            // The helper that sent this link: its send time matches the receive time
            const got = result.stages.deeplink;
            const helper = helpers
                .filter(h => Math.abs(h.sent - got) < 150)
                .sort((a, b) => Math.abs(a.sent - got) - Math.abs(b.sent - got))[0];
            if (helper) result.stages.helperStart = helper.start;
        }
        if (result) return result;
        return { ok: false, error: "No Roblox log has this launch. Logs may have been deleted, or Roblox did not get the link." };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}


// --- Roblox: resolve share link ---

const RESOLVE_URL = "https://apis.roblox.com/sharelinks/v1/resolve-link";

/**
 * Sends the two requests Roblox needs to resolve a share code: the first only fetches a CSRF token
 * (it always answers 403), the second resolves the link. `resolveRes` is null when no CSRF token came back.
 */
async function requestShareLink(token: string, shareCode: string) {
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

    const csrfRes = await fetch(RESOLVE_URL, { method: "POST", headers: headers() });
    const csrf = csrfRes.headers.get("x-csrf-token");
    if (!csrf) return { csrfRes, resolveRes: null, updatedToken: null };

    const resolveRes = await fetch(RESOLVE_URL, {
        method: "POST",
        headers: headers(csrf),
        body: JSON.stringify({ linkId: shareCode, linkType: "Server" }),
    });
    return { csrfRes, resolveRes, updatedToken: extractUpdatedToken(resolveRes) ?? extractUpdatedToken(csrfRes) };
}

/** Resolves a Roblox share code to its placeId and serverId. */
export async function resolveShareLink(
    _: IpcMainInvokeEvent,
    token: string,
    shareCode: string
): Promise<ResolvedShareLink> {
    try {
        const { csrfRes, resolveRes, updatedToken } = await requestShareLink(token, shareCode);
        if (!resolveRes) {
            return { ok: false, status: csrfRes.status, error: "CSRF token not returned by server." };
        }

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

        return { ok: true, placeId, serverId, ownerId, isValid, updatedToken };

    } catch (error) {
        return { ok: false, status: -1, error: (error as Error).message };
    }
}

/** The untouched answer to the resolve request, for the debug window. Cookie values are hidden, except a rotated token, which the caller saves. */
export async function resolveShareLinkRaw(
    _: IpcMainInvokeEvent,
    token: string,
    shareCode: string
): Promise<RawShareLink> {
    try {
        const { csrfRes, resolveRes, updatedToken } = await requestShareLink(token, shareCode);
        if (!resolveRes) return { ok: false, status: csrfRes.status, error: "CSRF token not returned by server." };

        const headers: Record<string, string> = {};
        resolveRes.headers.forEach((value, key) => {
            headers[key] = key === "set-cookie" ? value.replace(/(\.ROBLOSECURITY=)[^;]+/g, "$1<hidden>") : value;
        });
        return { ok: true, status: resolveRes.status, statusText: resolveRes.statusText, headers, body: await resolveRes.text(), updatedToken };
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

export async function emulatorTap(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    x: number,
    y: number
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }

    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }

    try {
        await execFile(adbPath, ["-s", deviceSerial, "shell", "input", "tap", String(Math.round(x)), String(Math.round(y))], { timeout: 10000 });
        return { ok: true };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

let cancelCapture: (() => void) | null = null;

/** Stops a running captureEmulatorTap, which then answers with an error. */
export async function cancelEmulatorCapture(): Promise<void> {
    cancelCapture?.();
}

/** Waits for one click on the emulator and returns where it was released. The raw coordinates match the screen when it is not rotated. */
export async function captureEmulatorTap(
    _: IpcMainInvokeEvent,
    adbPath: string,
    deviceSerial: string,
    timeoutMs = 30000
): Promise<{ ok: true; x: number; y: number; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }

    if (!adbPath || !fs.existsSync(adbPath)) {
        return { ok: false, error: `adb.exe not found at: ${adbPath}` };
    }

    // -tt forces a terminal: without it getevent buffers its output in 4 KB blocks and a single click never shows up
    cancelCapture?.();
    const proc = spawn(adbPath, ["-s", deviceSerial, "shell", "-tt", "getevent", "-l"], { shell: false });

    return await new Promise(resolve => {
        let x: number | null = null;
        let y: number | null = null;
        let buffer = "";
        let done = false;

        const finish = (result: { ok: true; x: number; y: number; } | { ok: false; error: string; }) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            cancelCapture = null;
            proc.kill();
            resolve(result);
        };

        cancelCapture = () => finish({ ok: false, error: "Cancelled." });

        const timer = setTimeout(() => finish({ ok: false, error: "No tap detected in time." }), timeoutMs);

        proc.stdout.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                // LDPlayer sends the mouse as REL_X/REL_Y holding absolute screen positions; real touch devices use ABS_MT_POSITION
                const m = line.match(/(ABS_MT_POSITION_[XY]|REL_[XY]|BTN_TOUCH|BTN_MOUSE)\s+(\S+)/);
                if (!m) continue;

                if (m[1].endsWith("_X")) x = parseInt(m[2], 16);
                else if (m[1].endsWith("_Y")) y = parseInt(m[2], 16);
                else if (m[2] === "UP" && x !== null && y !== null) finish({ ok: true, x, y });
            }
        });

        proc.on("error", err => finish({ ok: false, error: err.message }));
        proc.on("exit", code => finish({ ok: false, error: `getevent exited with code ${code}` }));
    });
}

/** Last resort: drops any capture, stops the window input helper, the adb server and every adb.exe, so nothing keeps clicking. */
export async function forceKillAdb(
    _: IpcMainInvokeEvent,
    adbPath: string
): Promise<{ ok: boolean; error?: string }> {
    if (process.platform !== "win32") {
        return { ok: false, error: "Windows only." };
    }

    cancelCapture?.();
    stopInputHost("Force killed.");

    if (adbPath && fs.existsSync(adbPath)) {
        await execFile(adbPath, ["kill-server"], { timeout: 5000 }).catch(() => { });
    }

    try {
        await exec("taskkill /F /T /IM adb.exe");
    } catch (err: any) {
        // taskkill exits with 128 when there is no adb.exe left, which is what we want
        if (err.code !== 128) return { ok: false, error: err.message };
    }
    return { ok: true };
}

// --- Roblox on this PC: window input ---

const encodePs = (script: string) => Buffer.from(script, "utf16le").toString("base64");

export type RobloxProcess = { pid: number; commandLine: string; startedAt: number; };

/** Every RobloxPlayerBeta.exe with the command line it was started with. */
export async function findRobloxProcesses(): Promise<{ ok: true; processes: RobloxProcess[]; } | { ok: false; error: string; }> {
    if (process.platform !== "win32") return { ok: false, error: "Windows only." };

    const script = `Get-CimInstance Win32_Process -Filter "Name='RobloxPlayerBeta.exe'" | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; commandLine = $_.CommandLine; startedAt = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } } | ConvertTo-Json -Compress`;
    try {
        const { stdout } = await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodePs(script)], { timeout: 15000 });
        const text = stdout.trim();
        if (!text) return { ok: true, processes: [] };
        const parsed = JSON.parse(text);
        const list: RobloxProcess[] = (Array.isArray(parsed) ? parsed : [parsed]).map(p => ({ pid: p.pid, commandLine: p.commandLine ?? "", startedAt: p.startedAt }));
        return { ok: true, processes: list };
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export type WinInputCommand =
    | { op: "reset"; }
    | { op: "info" | "focus" | "maximize"; pid: number; }
    | { op: "click"; pid: number; fx: number; fy: number; }
    | { op: "capture"; pid: number; timeoutMs: number; };

let inputHost: ChildProcessWithoutNullStreams | null = null;
let hostReady: Promise<void> | null = null;
let hostWaiter: { resolve: (line: string) => void; reject: (err: Error) => void; } | null = null;
let hostQueue: Promise<unknown> = Promise.resolve();

/** Stops the PowerShell that sends the clicks, so nothing keeps clicking. Whatever waits on it fails with `reason`. */
function stopInputHost(reason: string) {
    inputHost?.kill();
    inputHost = null;
    hostReady = null;
    hostWaiter?.reject(new Error(reason));
    hostWaiter = null;
}

function ensureInputHost(): Promise<void> {
    if (hostReady) return hostReady;

    const host = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePs(INPUT_HOST_SCRIPT)], { shell: false });
    inputHost = host;

    hostReady = new Promise<void>((resolve, reject) => {
        let buffer = "";
        let stderr = "";
        host.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
        host.stdout.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (line === "ready") resolve();
                else if (line.trim()) hostWaiter?.resolve(line);
            }
        });
        host.on("exit", () => {
            if (inputHost === host) stopInputHost("The input helper stopped.");
            reject(new Error(stderr.trim().slice(0, 300) || "The input helper stopped."));
        });
        host.on("error", err => reject(err));
    });
    hostReady.catch(() => { });
    return hostReady;
}

/** Looks at, focuses, maximizes or clicks the Roblox window of a process, or waits for the user to click it. Runs one at a time. */
export async function winInput(_: IpcMainInvokeEvent, cmd: WinInputCommand): Promise<any> {
    if (process.platform !== "win32") return { ok: false, error: "Windows only." };

    const run = async () => {
        await ensureInputHost();
        const timeoutMs = cmd.op === "capture" ? cmd.timeoutMs + 5000 : 20000;
        return await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => stopInputHost("The input helper took too long."), timeoutMs);
            hostWaiter = {
                resolve: line => { clearTimeout(timer); hostWaiter = null; resolve(line); },
                reject: err => { clearTimeout(timer); reject(err); },
            };
            inputHost!.stdin.write(JSON.stringify(cmd) + "\n");
        });
    };

    const next = hostQueue.then(run, run);
    hostQueue = next.catch(() => { });
    try {
        return JSON.parse(await next as string);
    } catch (err: any) {
        return { ok: false, error: err.message };
    }
}

export async function stopWinInput(): Promise<void> {
    stopInputHost("Cancelled.");
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

// Runs once and answers one JSON line per command. Compiling the Win32 helper takes about a second, so it stays alive between clicks.
const INPUT_HOST_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc p, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr e);
  public static IntPtr FindRobloxWindow(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p != pid || !IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(64); GetWindowText(h, sb, 64);
      if (sb.ToString() == "Roblox") { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
[W]::SetProcessDPIAware() | Out-Null

function Info($procId) {
  $h = [W]::FindRobloxWindow([uint32]$procId)
  if ($h -eq [IntPtr]::Zero) { return @{ ok = $true; found = $false } }
  $c = New-Object W+RECT
  [W]::GetClientRect($h, [ref]$c) | Out-Null
  $p = New-Object W+POINT
  [W]::ClientToScreen($h, [ref]$p) | Out-Null
  $w = $c.R - $c.L
  $ht = $c.B - $c.T
  return @{ ok = $true; found = $true; handle = $h.ToInt64(); x = $p.X; y = $p.Y; w = $w; h = $ht; maximized = [W]::IsZoomed($h); minimized = [W]::IsIconic($h); foreground = ([W]::GetForegroundWindow() -eq $h) }
}

function Focus($info) {
  $h = [IntPtr]::new([long]$info.handle)
  if ([W]::IsIconic($h)) { [W]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 300 }
  [W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
  [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [W]::SetForegroundWindow($h) | Out-Null
  Start-Sleep -Milliseconds 200
  return ([W]::GetForegroundWindow() -eq $h)
}

function Run($c) {
  $info = Info $c.pid
  if (-not $info.found) { return @{ ok = $false; error = 'No Roblox window found for that process.' } }
  switch ($c.op) {
    'info' { return $info }
    'focus' { return @{ ok = $true; foreground = (Focus $info) } }
    'maximize' {
      if ($info.maximized) { return @{ ok = $true; changed = $false; maximized = $true } }
      [W]::ShowWindow([IntPtr]::new([long]$info.handle), 3) | Out-Null
      Start-Sleep -Milliseconds 700
      $after = Info $c.pid
      return @{ ok = $true; changed = $true; maximized = $after.maximized }
    }
    'click' {
      $fg = Focus $info
      if (-not $fg) { return @{ ok = $true; clicked = $false; foreground = $false } }
      $info = Info $c.pid
      $x = $info.x + [int]($info.w * $c.fx / 100)
      $y = $info.y + [int]($info.h * $c.fy / 100)
      [W]::SetCursorPos($x, $y) | Out-Null
      Start-Sleep -Milliseconds 40
      # Roblox ignores a click from a mouse that has not moved, and SetCursorPos alone sends no movement event
      [W]::mouse_event(1, 2, 1, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 40
      [W]::mouse_event(1, [uint32]4294967294, [uint32]4294967295, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 40
      [W]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
      Start-Sleep -Milliseconds 40
      [W]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
      return @{ ok = $true; clicked = $true; x = $x; y = $y; foreground = $true }
    }
    'capture' {
      $end = [DateTime]::UtcNow.AddMilliseconds($c.timeoutMs)
      while ([DateTime]::UtcNow -lt $end -and ([W]::GetAsyncKeyState(1) -band 0x8000)) { Start-Sleep -Milliseconds 15 }
      $down = $false
      while ([DateTime]::UtcNow -lt $end) {
        $pressed = ([W]::GetAsyncKeyState(1) -band 0x8000) -ne 0
        if ($pressed) { $down = $true }
        elseif ($down) {
          $pt = New-Object W+POINT
          [W]::GetCursorPos([ref]$pt) | Out-Null
          $now = Info $c.pid
          $fx = ($pt.X - $now.x) * 100 / $now.w
          $fy = ($pt.Y - $now.y) * 100 / $now.h
          if ($fx -ge 0 -and $fx -le 100 -and $fy -ge 0 -and $fy -le 100) { return @{ ok = $true; fx = [Math]::Round($fx, 2); fy = [Math]::Round($fy, 2) } }
          $down = $false
        }
        Start-Sleep -Milliseconds 15
      }
      return @{ ok = $false; error = 'No click inside the Roblox window in time.' }
    }
  }
  return @{ ok = $false; error = 'Unknown command.' }
}

function CursorNow() {
  $pt = New-Object W+POINT
  [W]::GetCursorPos([ref]$pt) | Out-Null
  return $pt
}

# Where we left the cursor. If it is somewhere else next time, the user moved it and we must stop.
$script:last = $null

function UserMoved() {
  if ($null -eq $script:last) { return $false }
  $pt = CursorNow
  return ([Math]::Abs($pt.X - $script:last.X) -gt 4) -or ([Math]::Abs($pt.Y - $script:last.Y) -gt 4)
}

function Handle($c) {
  if ($c.op -eq 'reset') { $script:last = $null; return @{ ok = $true } }
  if ($c.op -ne 'capture' -and $c.op -ne 'info' -and (UserMoved)) { return @{ ok = $true; userMoved = $true } }
  $res = Run $c
  if ($c.op -ne 'capture' -and ($c.op -ne 'info' -or $null -eq $script:last)) { $pt = CursorNow; $script:last = @{ X = $pt.X; Y = $pt.Y } }
  return $res
}

[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while (($line = [Console]::In.ReadLine()) -ne $null) {
  try { $res = Handle ($line | ConvertFrom-Json) } catch { $res = @{ ok = $false; error = $_.Exception.Message } }
  [Console]::Out.WriteLine(($res | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}
`;
