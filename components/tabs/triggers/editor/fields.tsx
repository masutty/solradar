/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../../ui/scrollbar.css";

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { React, Slider, TextInput, Tooltip } from "@webpack/common";

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

// A greyed-out row that explains itself in a Discord tooltip anywhere you hover it
function FieldRow({ disabledReason, children }: { disabledReason?: string; children: React.ReactNode; }) {
    if (!disabledReason) return <div style={row}>{children}</div>;
    return (
        <Tooltip text={disabledReason}>
            {props => <div {...props} style={{ ...row, opacity: 0.5, cursor: "not-allowed" }}>{children}</div>}
        </Tooltip>
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

export function NumberField({ label, hint, tooltip, value, unit, disabledReason, onChange }: {
    label: string; hint?: string; tooltip?: string; value: number; unit?: string;
    /** Greys the field out and shows this on hover */
    disabledReason?: string;
    onChange: (v: number) => void;
}) {
    return (
        <FieldRow disabledReason={disabledReason}>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <Label label={label} tooltip={disabledReason ? undefined : tooltip} />
                {hint && <span style={descriptionText}>{hint}</span>}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 90, pointerEvents: disabledReason ? "none" : undefined }}>
                    <TextInput value={String(value)} disabled={Boolean(disabledReason)} onChange={v => onChange(Number(v) || 0)} />
                </div>
                {unit && <span style={descriptionText}>{unit}</span>}
            </span>
        </FieldRow>
    );
}

export function TextAreaField({ label, hint, value, placeholder, onChange, maxLength }: {
    label: string; hint?: string; value: string;
    placeholder?: string; onChange: (v: string) => void; maxLength?: number;
}) {
    // Grows with the text up to TEXTAREA_MAX_PX, then scrolls. No resize grip to drag.
    const ref = React.useRef<HTMLTextAreaElement>(null);
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight + 2, TEXTAREA_MAX_PX)}px`;
    }, [value]);

    return (
        <div style={rowStacked}>
            <Label label={label} />
            {hint && <span style={descriptionText}>{hint}</span>}
            {/* No scrollbar-width here: setting it turns off the thin-scroll styles and brings back the arrows */}
            <textarea
                ref={ref}
                className="vc-sora-textarea vc-sora-thin-scroll"
                value={value}
                placeholder={placeholder}
                onChange={e => onChange(e.target.value)}
                maxLength={maxLength}
            />
        </div>
    );
}

const TEXTAREA_MAX_PX = 220;

export function SwitchRow({ label, hint, tooltip, value, disabledReason, onChange }: {
    label: string; hint?: string; tooltip?: string; value: boolean;
    /** Greys the switch out and shows this on hover */
    disabledReason?: string;
    onChange: (v: boolean) => void;
}) {
    return (
        <FieldRow disabledReason={disabledReason}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <Label label={label} tooltip={disabledReason ? undefined : tooltip} />
                {hint && <span style={descriptionText}>{hint}</span>}
            </div>
            <div style={{ pointerEvents: disabledReason ? "none" : undefined }}>
                <Switch checked={value} disabled={Boolean(disabledReason)} onChange={onChange} />
            </div>
        </FieldRow>
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
