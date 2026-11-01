/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Switch } from "@components/Switch";
import { copyToClipboard } from "@utils/clipboard";
import { React, showToast, useState } from "@webpack/common";

import { HelpTip } from "./HelpTip";
import { Note } from "./Note";

const DISCORD_ID_RE = /\d{17,20}/;

// --- KeywordChip ---

function KeywordChip({ label, variant, selected, onRemove }: {
    label: string;
    variant: "match" | "exclude";
    /** Picked by Ctrl+A */
    selected?: boolean;
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
            boxShadow: selected ? `0 0 0 2px ${isMatch ? "var(--brand-500)" : "hsl(0deg 65% 55%)"}` : undefined,
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
    label: React.ReactNode;
    hint?: string;
    value: string[];
    /** Leave strict and onChangeStrict out to hide the Strict match toggle. */
    strict?: boolean;
    variant?: "match" | "exclude";
    onChangeValue: (v: string[]) => void;
    onChangeStrict?: (v: boolean) => void;
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
    // Ctrl+A on an empty input picks every chip, for Ctrl+C, Ctrl+X or Backspace
    const [allPicked, setAllPicked] = useState(false);

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
        const mod = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        if (mod && key === "a" && !input && value.length > 0) {
            e.preventDefault();
            setAllPicked(true);
            return;
        }
        if (allPicked) {
            if (mod && (key === "c" || key === "x")) {
                e.preventDefault();
                // Commas, so pasting it back into any keyword box splits it again
                copyToClipboard(value.join(", "));
                showToast({ text: `Copied ${value.length} ${value.length === 1 ? "keyword" : "keywords"}!`, variant: "success" });
                if (key === "x") { onChangeValue([]); setAllPicked(false); }
                return;
            }
            if (e.key === "Backspace" || e.key === "Delete") {
                e.preventDefault();
                onChangeValue([]);
                setAllPicked(false);
                return;
            }
            if (!mod) setAllPicked(false);
        }

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
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--control-secondary-text-default)", fontSize: 14, fontWeight: 500 }}>
                {label}
                <HelpTip text="Enter or a comma adds a word. Backspace removes the last one. Ctrl+A then Ctrl+C copies them all." />
            </span>
            {hint && (
                <span style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.4, marginTop: 2 }}>
                    {hint}
                </span>
            )}

            {/* Chip area, styled like Discord's inputs */}
            <div
                style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center",
                    gap: 5, marginTop: 8, padding: "7px 10px",
                    borderRadius: 8, background: "var(--input-background-default)",
                    border: "1px solid var(--input-border-default)",
                    minHeight: 40, boxSizing: "border-box", cursor: "text",
                }}
                onClick={e => (e.currentTarget as HTMLElement).querySelector("input")?.focus()}
            >
                {value.map((kw, i) => (
                    <KeywordChip
                        key={kw + i}
                        label={kw}
                        variant={variant}
                        selected={allPicked}
                        onRemove={() => onChangeValue(value.filter((_, j) => j !== i))}
                    />
                ))}
                <input
                    value={input}
                    onChange={e => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => setAllPicked(false)}
                    placeholder={value.length === 0 ? (placeholder ?? "Type a word and press Enter") : "Add a word"}
                    style={{
                        border: "none", outline: "none", background: "transparent",
                        color: "var(--text-default)", fontSize: 13,
                        minWidth: 100, flex: 1, padding: "2px 0",
                    }}
                />
            </div>

            {showIdWarning && (
                <Note variant="danger" style={{ marginTop: 6, fontSize: 12 }}>
                    If you are trying to match a role ID, please use the appropriate setting!
                </Note>
            )}

            {/* Strict match: a plain row under a line, on the same edges as everything above */}
            {onChangeStrict && (
                <div style={{
                    marginTop: 10, paddingTop: 10,
                    borderTop: "1px solid var(--background-mod-normal)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-default)" }}>Strict match</span>
                        <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>Only whole words count, so "cyber" won't match "cyberspace"</span>
                    </div>
                    <Switch checked={!!strict} onChange={onChangeStrict} />
                </div>
            )}
        </div>
    );
}
