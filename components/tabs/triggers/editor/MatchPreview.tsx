/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, TextInput, Tooltip, useState } from "@webpack/common";

import { COLORS, descriptionText, labelText } from "../../../ui/styles";

// --- Matching helpers ---

function generatePreviewMessages(name: string): string[] {
    const n = name.trim() || "Trigger";
    const mid = Math.ceil(n.length / 2);
    const lastChar = n[n.length - 1];
    return [
        `${n.toUpperCase()} spotted, join fast!`,
        `omg ${n} biome!!!`,
        `${n.slice(0, mid)} ${n.slice(mid)}`,
        `${n}${lastChar.repeat(4)}`,
        `${n}Biome`,
        `anyone hunting ${n}? need help`,
        `looking for ${n} server`,
    ];
}

function escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function testKw(text: string, kw: string, strict: boolean) {
    return new RegExp(strict ? `\\b${escapeRegex(kw)}\\b` : escapeRegex(kw), "i").test(text);
}

function highlight(text: string, kws: string[], strict: boolean, color: string): React.ReactNode[] {
    const active = kws.filter(k => k.trim());
    if (!active.length) return [text];
    const re = new RegExp(`(${active.map(k => strict ? `\\b${escapeRegex(k)}\\b` : escapeRegex(k)).join("|")})`, "gi");
    return text.split(re).map((part, i) =>
        i % 2 === 1
            ? <mark key={i} style={{ background: `color-mix(in srgb, ${color} 24%, transparent)`, color: "inherit", borderRadius: 3, boxShadow: `0 0 0 1px color-mix(in srgb, ${color} 24%, transparent)` }}>{part}</mark>
            : part
    );
}

type Verdict = "match" | "excluded" | "none";

const VERDICT: Record<Verdict, { label: string; color: string; }> = {
    match: { label: "Would match", color: COLORS.positive },
    excluded: { label: "Cancelled by a word in Must not contain", color: COLORS.danger },
    none: { label: "No match", color: COLORS.muted },
};

// Built on render, never at module load: JSX at import time crashes the whole Vencord renderer
function VerdictSymbol({ verdict }: { verdict: Verdict; }) {
    const { color } = VERDICT[verdict];
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={VERDICT[verdict].label} style={{ flexShrink: 0 }}>
            {verdict === "match" && <path d="M4.5 12.5l5 5 10-11" />}
            {verdict === "excluded" && <path d="m6 6 12 12M18 6 6 18" />}
            {verdict === "none" && <path d="M7 12h10" />}
        </svg>
    );
}

// --- MatchPreview ---

export function MatchPreview({ triggerName, matchKeywords, matchStrict, excludeKeywords, excludeStrict }: {
    triggerName: string;
    matchKeywords: string[];
    matchStrict: boolean;
    excludeKeywords: string[];
    excludeStrict: boolean;
}) {
    const [extra, setExtra] = useState<string[]>([]);
    const [draft, setDraft] = useState("");
    const messages = [...generatePreviewMessages(triggerName), ...extra];

    const verdictOf = (msg: string): Verdict => {
        if (excludeKeywords.some(k => k && testKw(msg, k, excludeStrict))) return "excluded";
        return matchKeywords.some(k => k && testKw(msg, k, matchStrict)) ? "match" : "none";
    };
    const matches = messages.filter(m => verdictOf(m) === "match").length;

    const addMessage = () => {
        const v = draft.trim();
        if (!v) return;
        setExtra(prev => [...prev, v]);
        setDraft("");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", borderRadius: 8, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <span style={labelText}>Preview</span>
                <span style={{ fontSize: 12, color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>
                    <b style={{ color: COLORS.text, fontWeight: 600 }}>{matches}</b> of {messages.length} would match
                </span>
            </div>
            <span style={descriptionText}>Sample messages, checked against the words above</span>

            <div style={{ marginTop: 8, padding: 4, borderRadius: 8, background: "var(--input-background-default)", border: "1px solid var(--input-border-default)" }}>
                {messages.map((msg, i) => {
                    const verdict = verdictOf(msg);
                    return (
                        <Tooltip key={`${i}-${msg}`} text={VERDICT[verdict].label}>
                            {props => (
                                <div {...props} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, padding: "3px 8px", borderRadius: 5, fontSize: 13 }}>
                                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", color: verdict === "none" ? COLORS.muted : COLORS.text }}>
                                        {verdict === "excluded"
                                            ? highlight(msg, excludeKeywords, excludeStrict, COLORS.danger)
                                            : highlight(msg, matchKeywords, matchStrict, COLORS.positive)}
                                    </span>
                                    <VerdictSymbol verdict={verdict} />
                                </div>
                            )}
                        </Tooltip>
                    );
                })}
            </div>

            <div style={{ marginTop: 8 }}>
                <TextInput
                    value={draft}
                    onChange={setDraft}
                    placeholder="Try your own message and press Enter"
                    onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && addMessage()}
                />
            </div>
        </div>
    );
}
