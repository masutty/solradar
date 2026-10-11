/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useState } from "@webpack/common";

import { PLUGIN_VERSION } from "../../../utils";

// --- Data ---

const DESCRIPTION =
    "SolRadar monitors Discord channels for private Roblox server links and, if configured, " +
    "joins them the moment they're detected.";

const QUICK_STEPS = [
    {
        title: "Import or create your triggers",
        detail: "Check out the support server for a pre-made trigger pack, or build your own from scratch.",
    },
    {
        title: "Enable the triggers you want",
        detail: "Toggle on auto-join and/or notifications on each trigger individually.",
    },
    {
        title: "Enable globally via the icon",
        detail: "Right-click the plugin icon in the chat bar to toggle auto-join and notifications globally.",
    },
    {
        title: "Sit back and wait",
        detail: "SolRadar runs in the background and handles the rest.",
    },
];

type CreditRole = "Author" | "Credits" | "Thanks" | "Framework";

interface CreditEntry {
    name: string;
    role: CreditRole;
    note?: string;
    url?: string;
}

const CREDITS: CreditEntry[] = [
    { name: "masutty", role: "Author", note: "oh hey thats me", url: "https://gitlab.com/masutty" },
    { name: "maxstellar", role: "Credits", note: "Biome icons", url: "https://github.com/maxstellar" },
    { name: "vexthecoder", role: "Credits", note: "Merchant icons", url: "https://github.com/vexsyx" },
    { name: "cresqnt-sys", role: "Credits", note: "Biome detection logic", url: "https://github.com/cresqnt-sys" },
    { name: "MonaSync", role: "Thanks", note: "ADB method; testing & debugging" },
    { name: "Vencord", role: "Framework", note: "This plugin wouldn't exist without it!", url: "https://vencord.dev" },
];

const LINKS = [
    { label: "Plugin source", url: "https://gitlab.com/masutty/solradar" },
    { label: "Installer source", url: "https://gitlab.com/masutty/solradar-installer" },
    { label: "Support server", url: "https://discord.gg/EfWHGGz7MG" },
];

// --- Styles ---

const ROLE_COLOR: Record<CreditRole, string> = {
    Author: "var(--brand-500)",
    Credits: "hsl(140deg 50% 44%)",
    Thanks: "hsl(38deg 95% 50%)",
    Framework: "hsl(270deg 60% 58%)",
};

// --- Quick Setup ---

function QuickSetup() {
    const [open, setOpen] = useState(false);

    return (
        <div>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", background: "none", border: "none",
                    padding: "10px 0", cursor: "pointer", textAlign: "left",
                }}
            >
                <span style={{
                    color: "var(--text-muted)", fontSize: 10,
                    display: "inline-block", lineHeight: 1,
                    transition: "transform 0.15s",
                    transform: open ? "rotate(90deg)" : "rotate(0deg)",
                }}>▶</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>
                    Quick Setup
                </span>
            </button>

            {open && (
                <div style={{ paddingLeft: 6, paddingBottom: 4 }}>
                    {QUICK_STEPS.map(({ title, detail }, i) => (
                        <div key={i} style={{ display: "flex", gap: 12, position: "relative" }}>
                            {/* vertical connector */}
                            {i < QUICK_STEPS.length - 1 && (
                                <div style={{
                                    position: "absolute",
                                    left: 11, top: 26,
                                    width: 2, height: "calc(100% - 10px)",
                                    background: "var(--background-mod-normal)",
                                }} />
                            )}
                            {/* step dot */}
                            <div style={{
                                width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                                background: "var(--brand-500)", marginTop: 2,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 11, fontWeight: 700, color: "#fff", zIndex: 1,
                            }}>
                                {i + 1}
                            </div>
                            <div style={{ paddingBottom: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)", lineHeight: 1.3 }}>
                                    {title}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.45 }}>
                                    {detail}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Credit Card ---

function CreditCard({ entry }: { entry: CreditEntry; }) {
    const color = ROLE_COLOR[entry.role];

    const content = (
        <div style={{
            display: "flex", flexDirection: "column", gap: 2,
            padding: "10px 12px", borderRadius: 8,
            background: "var(--background-mod-subtle)",
            height: "100%", boxSizing: "border-box",
        }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)", lineHeight: 1.2 }}>
                {entry.name}
            </div>
            <div style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.05em", color,
            }}>
                {entry.role}
            </div>
            {entry.note && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, lineHeight: 1.35 }}>
                    {entry.note}
                </div>
            )}
        </div>
    );

    const wrapStyle: React.CSSProperties = {
        flex: "1 1 180px", minWidth: 160, textDecoration: "none", display: "block",
        transition: "opacity 0.12s",
    };

    if (entry.url) {
        return (
            <a href={entry.url} target="_blank" rel="noreferrer" style={wrapStyle}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.65")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
            >
                {content}
            </a>
        );
    }

    return <div style={wrapStyle}>{content}</div>;
}

// --- AboutTab ---

export function AboutTab() {
    return (
        <div style={{ display: "flex", flexDirection: "column", padding: 16, gap: 0, boxSizing: "border-box" }}>

            {/* Hero */}
            <div style={{
                borderRadius: 10,
                background: "var(--background-mod-subtle)",
                border: "1px solid var(--background-mod-normal)",
                padding: "16px 18px",
                marginBottom: 16,
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text-default)", letterSpacing: "-0.02em" }}>
                        SolRadar
                    </span>
                    <span style={{
                        fontSize: 10, fontWeight: 700, color: "var(--brand-400)",
                        background: "hsl(var(--brand-500-hsl) / 0.15)",
                        border: "1px solid hsl(var(--brand-500-hsl) / 0.3)",
                        padding: "2px 8px", borderRadius: 999, letterSpacing: "0.04em",
                    }}>
                        v{PLUGIN_VERSION}
                    </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55, margin: "0 0 14px" }}>
                    {DESCRIPTION}
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {LINKS.map(({ label, url }) => (
                        <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                fontSize: 12, color: "var(--text-link)", textDecoration: "none",
                                padding: "4px 12px", borderRadius: 6,
                                border: "1px solid var(--background-mod-normal)",
                                background: "var(--background-mod-strong)",
                                transition: "border-color 0.12s, background 0.12s",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.borderColor = "var(--brand-500)";
                                e.currentTarget.style.background = "hsl(var(--brand-500-hsl) / 0.08)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.borderColor = "var(--background-mod-normal)";
                                e.currentTarget.style.background = "var(--background-mod-strong)";
                            }}
                        >
                            {label}
                        </a>
                    ))}
                </div>
            </div>

            {/* Quick Setup */}
            <div style={{
                borderRadius: 10,
                border: "1px solid var(--background-mod-normal)",
                padding: "4px 18px 4px",
                marginBottom: 16,
            }}>
                <QuickSetup />
            </div>

            {/* Credits */}
            <div>
                <span style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "0.07em", color: "var(--text-muted)",
                    display: "block", marginBottom: 8,
                }}>
                    Credits
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CREDITS.map(entry => <CreditCard key={entry.name} entry={entry} />)}
                </div>
            </div>

        </div>
    );
}
