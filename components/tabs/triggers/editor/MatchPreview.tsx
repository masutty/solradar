/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, TextInput, useState } from "@webpack/common";

import { COLORS } from "../../../ui/styles";

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
            ? <mark key={i} style={{ background: `color-mix(in srgb, ${color} 28%, transparent)`, color: "inherit", borderRadius: 3, padding: "0 2px", fontWeight: 600 }}>{part}</mark>
            : part
    );
}

type Verdict = "match" | "excluded" | "none";

const VERDICT: Record<Verdict, { label: string; color: string; }> = {
    match: { label: "Match", color: COLORS.positive },
    excluded: { label: "Excluded", color: COLORS.danger },
    none: { label: "No match", color: COLORS.muted },
};

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
        <div style={{ borderRadius: 8, background: "var(--background-mod-subtle)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 12, color: COLORS.muted, borderBottom: "1px solid var(--background-mod-subtle)" }}>
                <span>Preview with sample messages</span>
                <span><b style={{ color: COLORS.text }}>{matches}</b> of {messages.length} would match</span>
            </div>

            {messages.map((msg, i) => {
                const verdict = verdictOf(msg);
                const v = VERDICT[verdict];
                return (
                    <div key={`${i}-${msg}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", fontSize: 13, borderTop: i === 0 ? "none" : "1px solid var(--background-mod-subtle)" }}>
                        <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", color: verdict === "none" ? COLORS.muted : COLORS.text }}>
                            {verdict === "excluded"
                                ? highlight(msg, excludeKeywords, excludeStrict, COLORS.danger)
                                : highlight(msg, matchKeywords, matchStrict, COLORS.positive)}
                        </span>
                        <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 999, color: v.color, background: `color-mix(in srgb, ${v.color} 14%, transparent)` }}>
                            {v.label}
                        </span>
                    </div>
                );
            })}

            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--background-mod-subtle)" }}>
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
