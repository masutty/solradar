/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { React, useState } from "@webpack/common";

import { Note } from "./Note";

const DISCORD_ID_RE = /\d{17,20}/;

// --- KeywordChip ---

function KeywordChip({ label, variant, onRemove }: {
    label: string;
    variant: "match" | "exclude";
    onRemove: () => void;
}) {
    const isMatch = variant === "match";
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px 2px 10px",
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 500,
            background: isMatch ? "hsl(var(--brand-500-hsl) / 0.15)" : "hsl(0deg 65% 50% / 0.15)",
            color: isMatch ? "var(--brand-400)" : "hsl(0deg 65% 65%)",
            border: `1px solid ${isMatch ? "hsl(var(--brand-500-hsl) / 0.35)" : "hsl(0deg 65% 50% / 0.35)"}`,
        }}>
            <span style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 180,
            }}>
                {label}
            </span>
            <button
                onClick={onRemove}
                style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: 0, lineHeight: 1, fontSize: 15,
                    color: "inherit", opacity: 0.7, flexShrink: 0,
                }}
            >×</button>
        </span>
    );
}

// --- KeywordsInput ---

export interface KeywordsInputProps {
    label: string;
    hint?: string;
    value: string[];
    strict: boolean;
    variant?: "match" | "exclude";
    onChangeValue: (v: string[]) => void;
    onChangeStrict: (v: boolean) => void;
    placeholder?: string;
}

export function KeywordsInput({
    label,
    hint,
    value,
    strict,
    variant = "match",
    onChangeValue,
    onChangeStrict,
    placeholder,
}: KeywordsInputProps) {
    const [input, setInput] = useState("");

    const showIdWarning = DISCORD_ID_RE.test(input.trim());

    const addFromRaw = (raw: string) => {
        const toAdd = raw.split(",").map(s => s.trim()).filter(s => s && !value.includes(s));
        if (toAdd.length) onChangeValue([...value, ...toAdd]);
    };

    const handleChange = (raw: string) => {
        if (raw.includes(",")) {
            const parts = raw.split(",");
            const tail = parts.pop()!.trimStart();
            addFromRaw(parts.join(","));
            setInput(tail);
        } else {
            setInput(raw);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (input.trim()) { addFromRaw(input); setInput(""); }
        }
        if (e.key === "Backspace" && !input && value.length > 0) {
            onChangeValue(value.slice(0, -1));
        }
    };

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 0,
            padding: "10px 14px", borderRadius: 8,
            background: "var(--background-mod-subtle)",
        }}>
            <span style={{ color: "var(--control-secondary-text-default)", fontSize: 14, fontWeight: 500 }}>
                {label}
            </span>
            {hint && (
                <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                    {hint}
                </span>
            )}

            {/* Chip area */}
            <div
                style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center",
                    gap: 5, marginTop: 8, padding: "6px 10px",
                    borderRadius: 6, background: "var(--background-tertiary)",
                    border: "1px solid var(--background-mod-normal)",
                    minHeight: 38, cursor: "text",
                }}
                onClick={e => (e.currentTarget as HTMLElement).querySelector("input")?.focus()}
            >
                {value.map((kw, i) => (
                    <KeywordChip
                        key={kw + i}
                        label={kw}
                        variant={variant}
                        onRemove={() => onChangeValue(value.filter((_, j) => j !== i))}
                    />
                ))}
                <input
                    value={input}
                    onChange={e => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={value.length === 0 ? (placeholder ?? "Type and press Enter or comma…") : undefined}
                    style={{
                        border: "none", outline: "none", background: "transparent",
                        color: "var(--text-default)", fontSize: 13,
                        minWidth: 140, flex: 1, padding: "2px 0",
                    }}
                />
            </div>

            <span style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Press <strong>Enter</strong> or <strong>,</strong> to add · <strong>Backspace</strong> to remove last
            </span>

            {/* Discord ID warning */}
            {showIdWarning && (
                <Note variant="danger" style={{ marginTop: 6, fontSize: 12 }}>
                    If you are trying to match a role ID, please use the appropriate setting!
                </Note>
            )}

            {/* Strict match toggle */}
            <div style={{
                marginTop: 8, display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 12,
                padding: "8px 12px", borderRadius: 6,
                background: "var(--background-mod-normal)",
            }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-default)" }}>
                        Strict match
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>
                        When on, only matches the exact word, not partial matches.
                    </span>
                </div>
                <FormSwitch title="" value={strict} onChange={onChangeStrict} hideBorder />
            </div>
        </div>
    );
}
