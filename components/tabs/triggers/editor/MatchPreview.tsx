/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, TextInput, Tooltip, useState } from "@webpack/common";

import { settings } from "../../../../settings";
import { findExcluded, firstKeyword, stripSnipableLinks } from "../../../../services/MessageProcessor";
import { Trigger } from "../../../../types";
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

type Verdict = "match" | "excluded" | "global" | "none";

interface Result { verdict: Verdict; word?: string; }

const VERDICT: Record<Verdict, { color: string; }> = {
    match: { color: COLORS.positive },
    excluded: { color: COLORS.danger },
    global: { color: COLORS.danger },
    none: { color: COLORS.muted },
};

function verdictLabel({ verdict, word }: Result) {
    switch (verdict) {
        case "match": return "Would match";
        case "excluded": return `Cancelled by "${word}" in Must not contain`;
        case "global": return `Cancelled by "${word}" in your global Must not contain list`;
        default: return "No keyword in the message";
    }
}

// Built on render, never at module load: JSX at import time crashes the whole Vencord renderer
function VerdictSymbol({ result }: { result: Result; }) {
    const { verdict } = result;
    const { color } = VERDICT[verdict];
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label={verdictLabel(result)} style={{ flexShrink: 0 }}>
            {verdict === "match" && <path d="M4.5 12.5l5 5 10-11" />}
            {(verdict === "excluded" || verdict === "global") && <path d="m6 6 12 12M18 6 6 18" />}
            {verdict === "none" && <path d="M7 12h10" />}
        </svg>
    );
}

// --- MatchPreview ---

export function MatchPreview({ triggerName, conditions }: {
    triggerName: string;
    conditions: Pick<Trigger["conditions"], "keywords" | "bypassGlobalExclude">;
}) {
    const [extra, setExtra] = useState<string[]>([]);
    const [draft, setDraft] = useState("");
    const messages = [...generatePreviewMessages(triggerName), ...extra];
    const { match } = conditions.keywords;

    // Same order as the pipeline: a match keyword first, then the excluded words
    const resultOf = (msg: string): Result => {
        const text = stripSnipableLinks(msg);
        if (!firstKeyword(text, match)) return { verdict: "none" };
        const blocker = findExcluded(text, conditions);
        if (blocker) return { verdict: blocker.global ? "global" : "excluded", word: blocker.word };
        return { verdict: "match" };
    };
    const matches = messages.filter(m => resultOf(m).verdict === "match").length;

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
                    const result = resultOf(msg);
                    const { verdict } = result;
                    return (
                        <Tooltip key={`${i}-${msg}`} text={verdictLabel(result)}>
                            {props => (
                                <div {...props} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 28, padding: "3px 8px", borderRadius: 5, fontSize: 13 }}>
                                    <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", color: verdict === "none" ? COLORS.muted : COLORS.text }}>
                                        {verdict === "excluded" || verdict === "global"
                                            ? highlight(msg, [result.word!], verdict === "excluded" ? conditions.keywords.exclude.strict : settings.store.globalExcludeStrict, COLORS.danger)
                                            : highlight(msg, match.value, match.strict, COLORS.positive)}
                                    </span>
                                    <VerdictSymbol result={result} />
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
