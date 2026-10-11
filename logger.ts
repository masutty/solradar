/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger as VencordLogger } from "@utils/Logger";

// Vencord's Logger, but it also keeps the last lines in memory for the debug report.
// Renderer only: native.ts uses Vencord's Logger directly.

export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
    time: number;
    level: LogLevel;
    source: string;
    message: string;
}

const MAX_ENTRIES = 200;
const MAX_MESSAGE_LENGTH = 500;
const buffer: LogEntry[] = [];

function formatArg(arg: unknown): string {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

function record(level: LogLevel, source: string, args: unknown[]) {
    let message = args.map(formatArg).join(" ");
    if (message.length > MAX_MESSAGE_LENGTH) message = message.slice(0, MAX_MESSAGE_LENGTH) + "…";
    buffer.push({ time: Date.now(), level, source, message });
    if (buffer.length > MAX_ENTRIES) buffer.shift();
}

export function getRecentLogs(limit = 100): LogEntry[] {
    return buffer.slice(-limit);
}

export class Logger extends VencordLogger {
    public log(...args: any[]) {
        record("log", this.name, args);
        super.log(...args);
    }

    public info(...args: any[]) {
        record("info", this.name, args);
        super.info(...args);
    }

    public warn(...args: any[]) {
        record("warn", this.name, args);
        super.warn(...args);
    }

    public error(...args: any[]) {
        record("error", this.name, args);
        super.error(...args);
    }

    public debug(...args: any[]) {
        record("debug", this.name, args);
        super.debug(...args);
    }
}
