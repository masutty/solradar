/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./BiomeActionRule.css";

import { Button } from "@components/Button";
import { React, Select, TextInput } from "@webpack/common";

import { ACTION_OPTIONS, settings } from "../../../settings";
import { HelpTip } from "../../ui/HelpTip";

type Action = typeof ACTION_OPTIONS[number]["value"];
type ActionKey = "onBiomeFalse" | "onBiomeEnd" | "onBiomeTimeout";
type DelayKey = "biomeFalseActionTimeout" | "biomeEndActionTimeout" | "biomeTimeoutActionTimeout";

const STEP_MS = 500;
const MAX_MS = 60_000;

// --- Styles ---

const card: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
};

const sentence: React.CSSProperties = {
    color: "var(--control-secondary-text-default)",
    fontSize: 14,
    fontWeight: 500,
    whiteSpace: "nowrap",
    flexShrink: 0,
};

const title: React.CSSProperties = { ...sentence, display: "flex", alignItems: "center", gap: 6 };

function formatDelay(ms: number): string {
    return ms === 0 ? "No Delay" : `${ms / 1000} s`;
}

// --- Stepper ---

function DelayStepper({ value, onChange }: { value: number; onChange: (ms: number) => void; }) {
    const step = (delta: number) => onChange(Math.min(MAX_MS, Math.max(0, value + delta)));
    return (
        <div className="vc-sora-stepper">
            <Button variant="secondary" aria-label="Wait less" disabled={value <= 0} onClick={() => step(-STEP_MS)}>−</Button>
            <div className="vc-sora-stepper-value">
                <TextInput value={formatDelay(value)} disabled onChange={() => { }} />
            </div>
            <Button variant="secondary" aria-label="Wait more" disabled={value >= MAX_MS} onClick={() => step(STEP_MS)}>+</Button>
        </div>
    );
}

// --- Rule ---

/** One biome event read as a sentence: when this happens, do that, after this long. The title sits above the action and the wait. */
export function BiomeActionRule({ actionKey, delayKey, event, tooltip }: {
    actionKey: ActionKey;
    delayKey: DelayKey;
    event: string;
    /** What the event means, shown in the "?" */
    tooltip: string;
}) {
    const store = settings.use([actionKey, delayKey]);
    const action = store[actionKey];
    const delay = store[delayKey] ?? 0;

    return (
        <div data-sora-setting={actionKey} style={card}>
            <span style={title}>
                <span>When <strong style={{ color: "var(--text-default)", fontWeight: 600 }}>{event}</strong></span>
                <HelpTip text={tooltip} />
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <Select
                        placeholder="Select an option"
                        options={[...ACTION_OPTIONS]}
                        maxVisibleItems={6}
                        closeOnSelect
                        select={(v: Action) => { settings.store[actionKey] = v; }}
                        isSelected={(v: Action) => v === action}
                        serialize={(v: Action) => v}
                    />
                </div>
                {action !== "nothing" && (
                    <>
                        <span style={sentence}>after</span>
                        <DelayStepper
                            value={delay}
                            onChange={ms => { settings.store[delayKey] = ms; }}
                        />
                    </>
                )}
            </div>
        </div>
    );
}
