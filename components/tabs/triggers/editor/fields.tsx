/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../../ui/scrollbar.css";

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { React, Slider, TextInput } from "@webpack/common";

import { playAudio } from "../../../../utils";
import { IdChipInput } from "../../../ui/IdChipInput";
import { findRole } from "../../../ui/idFilter/resolve";
import { COLORS, descriptionText, labelText } from "../../../ui/styles";
import { HelpTip } from "../../settings/Setting";

// --- Styles ---

export const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
};

export const rowStacked: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
};

export const sectionHeading: React.CSSProperties = {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "14px 0 2px",
};

function Label({ label, tooltip }: { label: string; tooltip?: string; }) {
    return (
        <span style={{ ...labelText, display: "flex", alignItems: "center", gap: 6 }}>
            {label}
            {tooltip && <HelpTip text={tooltip} />}
        </span>
    );
}

// --- Fields ---

export function TextField({ label, hint, tooltip, value, placeholder, onChange, maxLength }: {
    label: string; hint?: string; tooltip?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; maxLength?: number;
}) {
    return (
        <div style={rowStacked}>
            <Label label={label} tooltip={tooltip} />
            {hint && <span style={descriptionText}>{hint}</span>}
            <TextInput value={value} placeholder={placeholder} onChange={onChange} maxLength={maxLength} />
        </div>
    );
}

export function NumberField({ label, tooltip, value, unit, onChange }: {
    label: string; tooltip?: string; value: number; unit?: string; onChange: (v: number) => void;
}) {
    return (
        <div style={row}>
            <Label label={label} tooltip={tooltip} />
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 90 }}>
                    <TextInput value={String(value)} onChange={v => onChange(Number(v) || 0)} />
                </div>
                {unit && <span style={descriptionText}>{unit}</span>}
            </span>
        </div>
    );
}

export function TextAreaField({ label, hint, value, placeholder, onChange, maxLength }: {
    label: string; hint?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; maxLength?: number;
}) {
    return (
        <div style={rowStacked}>
            <Label label={label} />
            {hint && <span style={descriptionText}>{hint}</span>}
            <textarea
                className="vc-sora-thin-scroll"
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                maxLength={maxLength}
                style={{
                    width: "100%",
                    resize: "vertical",
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "1px solid var(--background-mod-subtle)",
                    background: "var(--background-mod-strong)",
                    color: "var(--text-default)",
                    fontSize: 13,
                    fontFamily: "var(--font-primary)",
                    lineHeight: 1.5,
                    minHeight: 72,
                    boxSizing: "border-box",
                    outline: "none",
                    scrollbarWidth: "thin",
                }}
            />
        </div>
    );
}

export function SwitchRow({ label, hint, tooltip, value, onChange }: {
    label: string; hint?: string; tooltip?: string; value: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div style={row}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <Label label={label} tooltip={tooltip} />
                {hint && <span style={descriptionText}>{hint}</span>}
            </div>
            <Switch checked={value} onChange={onChange} />
        </div>
    );
}

// --- Roles ---

export function RoleChipInput({ roles, onChange }: {
    roles: { id: string; label: string; }[];
    onChange: (roles: { id: string; label: string; }[]) => void;
}) {
    // The saved label keeps a name around for roles that can no longer be found
    const labels = React.useMemo(() => Object.fromEntries(roles.filter(r => r.label).map(r => [r.id, r.label])), [roles]);
    return (
        <IdChipInput
            kind="role"
            label="Or mentions a role"
            hint="For servers that ping a role instead of naming the biome. Either keywords or a role is enough to match."
            ids={roles.map(r => r.id)}
            labels={labels}
            onChange={ids => onChange(ids.map(id => roles.find(r => r.id === id) ?? { id, label: findRole(id)?.role.name ?? "" }))}
        />
    );
}

// --- Sound ---

export function AudioField({ value, volume, onChangeAudio, onChangeVolume }: {
    value: string | undefined;
    volume: number | undefined;
    onChangeAudio: (dataUri: string | undefined) => void;
    onChangeVolume: (volume: number) => void;
}) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => onChangeAudio(ev.target?.result as string);
        reader.readAsDataURL(file);
        e.target.value = "";
    }

    return (
        <div style={rowStacked}>
            <Label label="Notification sound" />
            <span style={descriptionText}>Plays when this trigger notifies you. Leave empty for Discord's default.</span>
            <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={handleFileChange} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Button size="small" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                    {value ? "Replace" : "Choose a sound"}
                </Button>
                {value && <Button size="small" variant="secondary" onClick={() => playAudio(value, volume)}>Play</Button>}
                {value && <Button size="small" variant="dangerSecondary" style={{ marginLeft: "auto" }} onClick={() => onChangeAudio(undefined)}>Remove</Button>}
            </div>
            {value && (
                <>
                    <span style={{ ...descriptionText, marginTop: 8 }}>Volume ({volume ?? 100}%)</span>
                    <Slider minValue={0} maxValue={100} initialValue={volume ?? 100} onValueChange={v => onChangeVolume(Math.round(v))} />
                </>
            )}
        </div>
    );
}
