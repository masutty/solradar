/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SnipeEntry, SnipeLogEntry } from "../../../stores/SnipeStore";

// Reads a snipe's log and works out what happened: which step each line belongs to,
// how long each phase took, and why the snipe ended the way it did.
// Classifying by message keeps this working for snipes saved before steps existed.
// The messages are written by JoinService, BiomeWatcher, ForwardingService,
// SnipeDeduplicator and NotificationService, so update the patterns when those change.

export type StepKey = "dedupe" | "join" | "macro" | "link" | "lock" | "biome" | "notify" | "forward" | "afterwards" | "other";
export type PhaseKey = "join" | "verify" | "wait";

const STEP_PATTERNS: [StepKey, RegExp][] = [
    ["dedupe", /^Duplicate link/],
    ["macro", /^(Kill signal|.+: not found or failed to kill|LDPlayer|ADB )/],
    ["link", /^(Verifying link|Link |Joinguard|Join aborted: link)/],
    ["join", /^(Attempting to join|Joined in|Join failed|Auto-join is|Redundant )/],
    ["lock", /^Join lock/],
    ["afterwards", /^(Watching for biome|Biome ended)/],
    ["biome", /^(Awaiting biome|Biome |Releasing join lock)/],
    ["notify", /^(Notification sent|Playing custom notification|Sending cancelable notification)/],
    ["forward", /^Forward/],
];

export function stepOf(line: SnipeLogEntry): StepKey {
    return STEP_PATTERNS.find(([, re]) => re.test(line.message))?.[0] ?? "other";
}

const PHASE_OF: Partial<Record<StepKey, PhaseKey>> = {
    dedupe: "join", join: "join", macro: "join",
    link: "verify",
    lock: "wait", biome: "wait", notify: "wait",
};

export const PHASES: Record<PhaseKey, { name: string; color: string; tip: string; }> = {
    join: { name: "Joining", color: "var(--brand-500)", tip: "From the message arriving to Roblox opening the server." },
    verify: { name: "Checking the link", color: "var(--status-positive)", tip: "Making sure the link leads to a Sol's RNG server you allow." },
    wait: { name: "Biome check", color: "var(--status-warning)", tip: "Waiting for your game to show the biome. Ends when it's confirmed, turns out to be bait, or times out." },
};

export const phaseOf = (step: StepKey): PhaseKey | undefined => PHASE_OF[step];

/** Lines a person reads: no debug lines. */
export const visibleLines = (entry: SnipeEntry) => entry.log.filter(l => l.level !== "debug");

export interface PhaseSpan {
    key: PhaseKey;
    /** ms after the snipe */
    start: number;
    end: number;
}

/**
 * Phases in the order they started. Each starts where the line before it ended.
 * Empty when the snipe never joined: a few milliseconds of "Joining" would only mislead.
 */
export function phaseSpans(entry: SnipeEntry): PhaseSpan[] {
    if (!entry.metrics) return [];
    const lines = visibleLines(entry);
    const spans: PhaseSpan[] = [];
    lines.forEach((line, i) => {
        const key = phaseOf(stepOf(line));
        if (!key) return;
        const t = line.timestamp - entry.timestamp;
        const span = spans.find(s => s.key === key);
        if (span) span.end = Math.max(span.end, t);
        else spans.push({ key, start: i ? lines[i - 1].timestamp - entry.timestamp : 0, end: t });
    });
    return spans.map(s => ({ ...s, start: Math.max(0, Math.min(s.start, s.end)) }));
}

export const processingTime = (spans: PhaseSpan[]) => spans.reduce((max, s) => Math.max(max, s.end), 0);

// --- Result icon ---

export type OutcomeIcon = "ok" | "bad" | "wait" | "skip" | "info";

/** The glyph for the result dot on a snipe's icon. */
export function outcomeIcon(entry: SnipeEntry): OutcomeIcon {
    const { tags } = entry;
    if (tags.includes("failed") || tags.includes("link-verified-unsafe") || tags.includes("biome-verified-bait")) return "bad";
    if (tags.includes("biome-verified-real")) return "ok";
    if (tags.includes("biome-verified-timeout")) return "wait";
    if (tags.includes("redundant-biome-ignored") || tags.includes("link-ignored") || !entry.metrics) return "skip";
    return "info";
}

