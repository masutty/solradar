/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { OptionType } from "@utils/types";
import { React, Select, TextInput, Tooltip } from "@webpack/common";

import { settings } from "../../../settings";
import { ChipKind, IdChipInput } from "../../ui/IdChipInput";

// --- Types ---

type SettingsKey = keyof typeof settings.def;

export type SettingProps = {
    id: SettingsKey;
    label: string; // required, never taken from def.description
    description?: string; // shown below the control as a hint
    tooltip?: string; // shown in a ? badge on hover next to the label
    disabled?: boolean;
    style?: React.CSSProperties;
    chipKind?: ChipKind;
    tech?: boolean; // shows a "Technical" badge next to the label
};

// --- Styles ---

const S = {
    row: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-mod-subtle)",
    } as React.CSSProperties,

    rowStacked: {
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 0,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--background-mod-subtle)",
    } as React.CSSProperties,

    rowLeft: {
        display: "flex",
        flexDirection: "column",
        gap: 3,
        flex: 1,
        minWidth: 0,
    } as React.CSSProperties,

    label: {
        color: "var(--control-secondary-text-default)",
        fontSize: 14,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: "wrap",
    } as React.CSSProperties,

    description: {
        color: "var(--text-muted)",
        fontSize: 12,
        lineHeight: 1.4,
        marginTop: 2,
    } as React.CSSProperties,

    restartBadge: {
        fontSize: 10,
        fontWeight: 600,
        color: "var(--status-warning)",
        background: "hsl(38deg 95% 54% / 15%)",
        border: "1px solid hsl(38deg 95% 54% / 30%)",
        borderRadius: 4,
        padding: "1px 5px",
        letterSpacing: "0.04em",
        flexShrink: 0,
    } as React.CSSProperties,

    techBadge: {
        fontSize: 10,
        fontWeight: 600,
        color: "var(--text-muted)",
        background: "var(--background-mod-strong)",
        borderRadius: 4,
        padding: "1px 5px",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        cursor: "help",
        flexShrink: 0,
    } as React.CSSProperties,

    toggle: {
        width: 36,
        height: 20,
        flexShrink: 0,
        cursor: "pointer",
        accentColor: "var(--brand-500)",
    } as React.CSSProperties,

    select: {
        background: "var(--background-mod-subtle)",
        border: "1px solid var(--background-mod-subtle)",
        borderRadius: 4,
        color: "var(--control-secondary-text-default)",
        fontSize: 13,
        padding: "5px 8px",
        cursor: "pointer",
        flexShrink: 0,
        maxWidth: 240,
    } as React.CSSProperties,

    input: {
        background: "var(--background-mod-strong)",
        border: "1px solid var(--background-mod-normal)",
        borderRadius: 4,
        color: "var(--control-secondary-text-default)",
        fontSize: 13,
        padding: "6px 8px",
        width: "100%",
        boxSizing: "border-box",
        marginTop: 8,
        outline: "none",
    } as React.CSSProperties,

    error: {
        color: "var(--text-danger)",
        fontSize: 11,
        marginTop: 4,
    } as React.CSSProperties,
};

// --- Badges ---

export function HelpTip({ text }: { text: string; }) {
    return (
        <Tooltip text={text}>
            {props => (
                <span {...props} style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: "var(--background-mod-strong)",
                    color: "var(--text-muted)",
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: "help",
                    flexShrink: 0,
                    userSelect: "none",
                }}>?</span>
            )}
        </Tooltip>
    );
}

export function TechBadge() {
    return (
        <Tooltip text="Technical setting. The defaults work for most people.">
            {props => <span {...props} style={S.techBadge}>Technical</span>}
        </Tooltip>
    );
}

// --- Controls ---

// Read settings.store at render time, not when the module loads
const s = () => settings.store as Record<string, any>;

function IdChipControl({ id, kind, label, hint, tooltip }: {
    id: SettingsKey;
    kind: ChipKind;
    label: string;
    hint?: string;
    tooltip?: string;
}) {
    const raw = settings.use([id])[id] as string ?? "";
    const ids = raw.split(",").map(v => v.trim()).filter(Boolean);

    const labelNode = tooltip ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {label}
            <Tooltip text={tooltip}>
                {props => (
                    <span {...props} style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 15,
                        height: 15,
                        borderRadius: "50%",
                        background: "var(--background-mod-strong)",
                        color: "var(--text-muted)",
                        fontSize: 10,
                        fontWeight: 700,
                        cursor: "help",
                        flexShrink: 0,
                        userSelect: "none",
                    }}>?</span>
                )}
            </Tooltip>
        </span>
    ) : label;

    return (
        <IdChipInput
            kind={kind}
            label={labelNode}
            hint={hint}
            ids={ids}
            onChange={newIds => { s()[id] = newIds.join(", "); }}
        />
    );
}

function BooleanControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const value = settings.use([id])[id] as boolean;
    return (
        <FormSwitch
            title=""
            value={!!value}
            onChange={v => (s()[id] = v)}
            hideBorder
            disabled={disabled}
        />
    );
}

function SelectControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const def = settings.def[id] as any;
    const value = settings.use([id])[id];
    const options = def.options ?? [];

    const handleChange = (selectedValue: any) => {
        s()[id] = selectedValue;
    };

    const isSelected = (optionValue: any) => {
        return optionValue === value;
    };

    return (
        <Select
            placeholder={def.placeholder ?? "Select an option"}
            options={options}
            maxVisibleItems={5}
            closeOnSelect={true}
            select={handleChange}
            isSelected={isSelected}
            serialize={v => String(v)}
            {...def.componentProps}
        />
    );
}

function StringControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const stored = settings.use([id])[id] as string ?? "";
    const [raw, setRaw] = React.useState(stored);

    React.useEffect(() => setRaw(stored), [stored]);

    const commit = React.useCallback((v: string) => {
        s()[id] = v;
    }, [id]);

    React.useEffect(() => {
        if (raw === stored) return;
        const t = setTimeout(() => commit(raw), 400);
        return () => clearTimeout(t);
    }, [raw]);

    return (
        <TextInput
            value={raw}
            disabled={disabled}
            placeholder={disabled ? "" : "Enter value..."}
            onChange={v => setRaw(v)}
            onBlur={() => commit(raw)}
        />
    );
}

function NumberControl({ id, disabled }: { id: SettingsKey; disabled?: boolean; }) {
    const def = settings.def[id] as any;
    const value = settings.use([id])[id] as number;

    const [raw, setRaw] = React.useState(String(value ?? ""));
    const [errMsg, setErrMsg] = React.useState<string | null>(null);

    React.useEffect(() => setRaw(String(value ?? "")), [value]);

    const validate = (v: string): string | null => {
        const n = Number(v);
        if (isNaN(n)) return "Must be a number";
        if (def.min != null && n < def.min) return `Min: ${def.min}`;
        if (def.max != null && n > def.max) return `Max: ${def.max}`;
        return null;
    };

    const commit = (v: string) => {
        const err = validate(v);
        setErrMsg(err);
        if (!err) s()[id] = Number(v);
    };

    return (
        <>
            <TextInput
                value={raw}
                placeholder={def.min != null ? String(def.min) : undefined}
                disabled={disabled}
                onChange={v => { setRaw(v); commit(v); }}
            />
            {errMsg && <span style={S.error}>{errMsg}</span>}
        </>
    );
}

// --- Setting ---

export function Setting({ id, label, description, tooltip, disabled, style, chipKind, tech }: SettingProps) {
    const def = settings.def[id] as any;
    if (!def) return null;

    const restartNeeded = !!def.restartNeeded;
    const isInline =
        def.type === OptionType.BOOLEAN
        || (def.type === OptionType.SELECT && (!description
            || description.split(/\s+/).filter(Boolean).join(" ").length < 50));

    const labelNode = (
        <span style={S.label}>
            {label}
            {restartNeeded && <span style={S.restartBadge}>restart</span>}
            {tech && <TechBadge />}
            {tooltip && (
                <Tooltip text={tooltip}>
                    {props => (
                        <span {...props} style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 15,
                            height: 15,
                            borderRadius: "50%",
                            background: "var(--background-mod-strong)",
                            color: "var(--text-muted)",
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "help",
                            flexShrink: 0,
                            userSelect: "none",
                        }}>?</span>
                    )}
                </Tooltip>
            )}
        </span>
    );

    let control: React.ReactNode;
    switch (def.type) {
        case OptionType.BOOLEAN: control = <BooleanControl id={id} disabled={disabled} />; break;
        case OptionType.SELECT: control = <SelectControl id={id} disabled={disabled} />; break;
        case OptionType.STRING:
            if (chipKind) return (
                <div data-sora-setting={id}>
                    <IdChipControl id={id} kind={chipKind} label={label} hint={description} tooltip={tooltip} />
                </div>
            );
            control = <StringControl id={id} disabled={disabled} />;
            break;
        case OptionType.NUMBER: control = <NumberControl id={id} disabled={disabled} />; break;
        default: return null;
    }

    if (isInline) {
        return (
            <div data-sora-setting={id} style={{ ...S.row, opacity: disabled ? 0.5 : 1, ...style }}>
                <div style={S.rowLeft}>
                    {labelNode}
                    {description && <span style={S.description}>{description}</span>}
                </div>
                {control}
            </div>
        );
    }

    return (
        <div data-sora-setting={id} style={{ ...S.rowStacked, opacity: disabled ? 0.5 : 1, ...style }}>
            {labelNode}
            {description && <span style={S.description}>{description}</span>}
            {control}
        </div>
    );
}
