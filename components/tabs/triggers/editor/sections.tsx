/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../../ui/choice.css";

import { React, useEffect, useState } from "@webpack/common";

import { settings } from "../../../../settings";
import { DEFAULT_BIOME, Trigger, TriggerType } from "../../../../stores/TriggerStore";
import { IdChipInput } from "../../../ui/IdChipInput";
import { KeywordsInput } from "../../../ui/KeywordsInput";
import { Note } from "../../../ui/Note";
import { COLORS, descriptionText } from "../../../ui/styles";
import { AudioField, NumberField, RoleChipInput, rowStacked, sectionHeading, SwitchRow, TextAreaField, TextField } from "./fields";
import { MatchPreview } from "./MatchPreview";

export type Draft = Omit<Trigger, "id">;
export type Patch = (p: Partial<Draft>) => void;

// --- Trigger types ---

export const TYPE_META: Record<TriggerType, { label: string; color: string; }> = {
    RARE_BIOME: { label: "Rare biome", color: "#f23f43" },
    EVENT_BIOME: { label: "Event biome", color: "#3ba55d" },
    BIOME: { label: "Biome", color: "#eb459e" },
    WEATHER: { label: "Weather", color: "#00a8fc" },
    MERCHANT: { label: "Merchant", color: "#f0b132" },
    CUSTOM: { label: "Custom", color: "#949ba4" },
};

export const hasBiomeCheck = (type: TriggerType) => type !== "MERCHANT";

// --- Essentials ---

const ALWAYS_ALLOWED_DOMAINS = ["github.io", "githubusercontent.com", "cdn.discordapp.com"];

function useIconAllowed(iconUrl: string) {
    const [allowed, setAllowed] = useState<boolean | null>(null);
    useEffect(() => {
        if (!iconUrl) return void setAllowed(null);
        try {
            const { origin, hostname } = new URL(iconUrl);
            if (ALWAYS_ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))) return void setAllowed(true);
            VencordNative.csp.isDomainAllowed(origin, ["img-src"]).then(setAllowed);
        } catch {
            setAllowed(null);
        }
    }, [iconUrl]);
    return allowed;
}

export function TriggerIcon({ draft, size }: { draft: Draft; size: number; }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [draft.iconUrl]);
    const meta = TYPE_META[draft.type];
    if (draft.iconUrl && !broken) {
        return (
            <span style={{ width: size, height: size, borderRadius: size / 4.5, overflow: "hidden", flexShrink: 0, display: "block" }}>
                <img src={draft.iconUrl} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </span>
        );
    }
    return (
        <span style={{ width: size, height: size, borderRadius: size / 4.5, flexShrink: 0, display: "grid", placeItems: "center", fontSize: size / 2.2, fontWeight: 700, color: meta.color, background: `color-mix(in srgb, ${meta.color} 20%, var(--background-mod-subtle))` }}>
            {draft.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
    );
}

function TypePicker({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const choose = (type: TriggerType) => patch({
        type,
        biome: hasBiomeCheck(type) ? (draft.biome ?? { ...DEFAULT_BIOME }) : undefined,
    });

    return (
        <div style={rowStacked}>
            <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.label }}>Type</span>
            <span style={descriptionText}>What kind of event this trigger watches for.</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6, marginTop: 4 }}>
                {(Object.keys(TYPE_META) as TriggerType[]).map(type => {
                    const meta = TYPE_META[type];
                    const active = draft.type === type;
                    return (
                        <button
                            key={type}
                            type="button"
                            className="vc-sora-tile"
                            onClick={() => choose(type)}
                            aria-pressed={active}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                padding: "8px 12px",
                                border: "none",
                                borderRadius: 8,
                                cursor: "pointer",
                                textAlign: "left",
                                fontSize: 13,
                                fontWeight: 500,
                                ...(active && {
                                    color: COLORS.text,
                                    background: `color-mix(in srgb, ${meta.color} 16%, var(--background-mod-strong))`,
                                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.color} 55%, transparent)`,
                                }),
                            }}
                        >
                            {meta.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function CoreTiles({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const tiles: [keyof Draft["state"], string, string, string, string][] = [
        ["enabled", "⚡", "Enabled", "The trigger is active.", COLORS.positive],
        ["autojoin", "🎯", "Auto-join", "Join as soon as it matches.", "var(--brand-500)"],
        ["notify", "🔔", "Notify", "Desktop alert on a match.", "#eb459e"],
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            {tiles.map(([key, emoji, label, desc, color]) => {
                const on = Boolean(draft.state[key]);
                return (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => patch({ state: { ...draft.state, [key]: !on } })}
                        style={{
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            padding: 12,
                            border: "none",
                            borderRadius: 10,
                            cursor: "pointer",
                            textAlign: "left",
                            color: COLORS.text,
                            background: on ? `color-mix(in srgb, ${color} 14%, var(--background-mod-subtle))` : "var(--background-mod-subtle)",
                            boxShadow: on ? `inset 0 0 0 1.5px color-mix(in srgb, ${color} 55%, transparent)` : "none",
                            transition: "background 0.15s, box-shadow 0.15s",
                        }}
                    >
                        <span style={{ position: "absolute", top: 10, right: 10, fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, color: on ? "#fff" : COLORS.muted, background: on ? color : "var(--background-mod-strong)" }}>
                            {on ? "ON" : "OFF"}
                        </span>
                        <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</span>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.35 }}>{desc}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function EssentialsSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const iconAllowed = useIconAllowed(draft.iconUrl);
    const { keywords } = draft.conditions;
    const patchKeywords = (side: "match" | "exclude", p: Partial<typeof keywords.match>) =>
        patch({ conditions: { ...draft.conditions, keywords: { ...keywords, [side]: { ...keywords[side], ...p } } } });

    return (
        <>
            <p style={{ ...sectionHeading, marginTop: 0 }}>Identity</p>
            <TypePicker draft={draft} patch={patch} />
            <div style={rowStacked}>
                <span style={{ fontSize: 14, fontWeight: 500, color: COLORS.label }}>Name and icon</span>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 2 }}>
                    <TriggerIcon draft={draft} size={48} />
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <TextField label="" value={draft.name} placeholder="Name, e.g. Glitched" onChange={v => patch({ name: v })} />
                    </div>
                </div>
            </div>
            <TextField
                label="Icon URL"
                hint="Optional. A direct link to an image."
                value={draft.iconUrl}
                placeholder="https://cdn.discordapp.com/..."
                onChange={v => patch({ iconUrl: v })}
            />
            {iconAllowed === false && (
                <Note variant="warning">
                    This image probably won't load, because Discord only shows images from allowed sites. Use cdn.discordapp.com, imgur.com or githubusercontent.com instead. The trigger still works either way.
                </Note>
            )}
            <TextField label="Description" hint="Only for you, to remember what this trigger is." value={draft.description} placeholder="Optional" onChange={v => patch({ description: v })} />

            <p style={sectionHeading}>What it does</p>
            <CoreTiles draft={draft} patch={patch} />

            <p style={sectionHeading}>When it fires</p>
            <KeywordsInput
                label="Must contain"
                hint="At least one of these words."
                value={keywords.match.value}
                strict={keywords.match.strict}
                variant="match"
                onChangeValue={v => patchKeywords("match", { value: v })}
                onChangeStrict={v => patchKeywords("match", { strict: v })}
                placeholder="e.g. glitch, glitched"
            />
            <KeywordsInput
                label="Must not contain"
                hint="Any of these cancels the match."
                value={keywords.exclude.value}
                strict={keywords.exclude.strict}
                variant="exclude"
                onChangeValue={v => patchKeywords("exclude", { value: v })}
                onChangeStrict={v => patchKeywords("exclude", { strict: v })}
                placeholder="e.g. hunt, help, looking for"
            />
            <MatchPreview
                triggerName={draft.name}
                matchKeywords={keywords.match.value}
                matchStrict={keywords.match.strict}
                excludeKeywords={keywords.exclude.value}
                excludeStrict={keywords.exclude.strict}
            />
            <RoleChipInput roles={draft.conditions.mentionRoles} onChange={roles => patch({ conditions: { ...draft.conditions, mentionRoles: roles } })} />
        </>
    );
}

// --- Optional sections ---

function JoinLockSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const patchState = (p: Partial<Draft["state"]>) => patch({ state: { ...draft.state, ...p } });
    return (
        <>
            <SwitchRow
                label="Join lock"
                hint="After joining, block lower-priority triggers for a while."
                tooltip="Useful when the same biome gets posted many times in a row. Without it, you'd keep getting sent to new servers."
                value={draft.state.joinlock}
                onChange={v => patchState({ joinlock: v })}
            />
            {draft.state.joinlock && <>
                <NumberField
                    label="Priority"
                    tooltip="1 is the highest. While the lock is on, only triggers with a lower number can still join."
                    value={draft.state.priority}
                    onChange={v => patchState({ priority: v })}
                />
                <NumberField label="Lock for" unit="seconds" value={draft.state.joinlockDuration} onChange={v => patchState({ joinlockDuration: v })} />
            </>}
        </>
    );
}

function SoundSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const patchState = (p: Partial<Draft["state"]>) => patch({ state: { ...draft.state, ...p } });
    return (
        <AudioField
            value={draft.state.notificationSound}
            volume={draft.state.notificationSoundVolume}
            onChangeAudio={v => patchState({ notificationSound: v })}
            onChangeVolume={v => patchState({ notificationSoundVolume: v })}
        />
    );
}

function BiomeSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const { detectorEnabled, detectorAccounts } = settings.use(["detectorEnabled", "detectorAccounts"]);
    const biome = draft.biome ?? DEFAULT_BIOME;
    const patchBiome = (p: Partial<typeof biome>) => patch({ biome: { ...biome, ...p } });

    return (
        <>
            {!detectorEnabled && <Note variant="warning">Biome detection is off in the plugin settings, so this check won't run until you turn it on there.</Note>}
            {detectorEnabled && !detectorAccounts && <Note variant="warning">No Roblox accounts are set up for biome detection. Add one in the plugin settings.</Note>}
            <SwitchRow label="Confirm the biome" hint="After joining, read the Roblox logs to check the biome is real." value={biome.detectionEnabled} onChange={v => patchBiome({ detectionEnabled: v })} />
            {biome.detectionEnabled && <>
                <TextField
                    label="Biome name in the logs"
                    hint="Case-insensitive."
                    tooltip='Matches the BloxstrapRPC "hoverText" field in the Roblox log.'
                    value={biome.detectionKeyword}
                    placeholder="e.g. GLITCHED"
                    onChange={v => patchBiome({ detectionKeyword: v })}
                />
                <SwitchRow label="Skip if already there" hint="If you're already in this biome, don't join again. Still notifies." value={biome.skipRedundantJoin} onChange={v => patchBiome({ skipRedundantJoin: v })} />
            </>}
        </>
    );
}

function ForwardingSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const { globalWebhookUrl } = settings.use(["globalWebhookUrl"]);
    const f = draft.forwarding;
    const patchF = (p: Partial<typeof f>) => patch({ forwarding: { ...f, ...p } });
    const hasWebhook = Boolean(f.webhookUrl.trim() || globalWebhookUrl?.trim());

    return (
        <>
            <Note variant="warning">Optional, and most people don't need it. Sending a webhook on every match can hit Discord's rate limits and get the webhook disabled.</Note>
            <TextField
                label="Webhook URL"
                hint={globalWebhookUrl ? "Leave empty to use the global webhook from Settings." : "No global webhook is set in Settings, so add one here to forward."}
                value={f.webhookUrl}
                placeholder="https://discord.com/api/webhooks/..."
                onChange={v => patchF({ webhookUrl: v })}
            />
            {!hasWebhook && <Note variant="warning">No webhook is set, so nothing will be forwarded.</Note>}
            <SwitchRow label="Forward on match" hint="Send to the webhook when the trigger matches." value={f.onMatch.enabled} onChange={v => patchF({ onMatch: { ...f.onMatch, enabled: v } })} />
            {f.onMatch.enabled && <SwitchRow label="Forward early" hint="As soon as possible. Can slightly slow the join." value={f.onMatch.early} onChange={v => patchF({ onMatch: { ...f.onMatch, early: v } })} />}
            {hasBiomeCheck(draft.type) && (
                <SwitchRow label="Forward on detection" hint="Send when the biome is confirmed. Needs biome detection set up." value={f.onDetection.enabled} onChange={v => patchF({ onDetection: { enabled: v } })} />
            )}
            <TextAreaField label="Message text" hint="Sent outside the embed. Max 2000 characters." value={f.webhookContent} placeholder="Optional" onChange={v => patchF({ webhookContent: v })} maxLength={2000} />
            <TextAreaField label="Embed text" hint="Added before the embed description. Max 2000 characters." value={f.webhookEmbedDescription} placeholder="Optional" onChange={v => patchF({ webhookEmbedDescription: v })} maxLength={2000} />
            <IdChipInput kind="guild" label="Don't forward from these servers" ids={f.excludedGuilds ?? []} onChange={ids => patchF({ excludedGuilds: ids })} />
            <IdChipInput kind="channel" label="Don't forward from these channels" ids={f.excludedChannels ?? []} onChange={ids => patchF({ excludedChannels: ids })} />
        </>
    );
}

function FiltersSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const c = draft.conditions;
    const patchC = (p: Partial<typeof c>) => patch({ conditions: { ...c, ...p } });
    return (
        <>
            <p style={{ ...descriptionText, margin: "0 2px 4px" }}>Narrow down when this trigger fires. Every filter you set must pass.</p>
            <IdChipInput kind="user" label="Only from these users" hint="Leave empty for anyone." ids={c.fromUser} onChange={ids => patchC({ fromUser: ids })} />
            <IdChipInput kind="channel" label="Only in these channels" hint="Leave empty for any monitored channel." ids={c.inChannel} onChange={ids => patchC({ inChannel: ids })} />
            <IdChipInput kind="channel" label="Never in these channels" hint="On top of the channels ignored in Settings." ids={c.ignoredChannels} onChange={ids => patchC({ ignoredChannels: ids })} />
            <IdChipInput kind="guild" label="Never in these servers" hint="Good for servers with no-sniper rules." ids={c.ignoredGuilds} onChange={ids => patchC({ ignoredGuilds: ids })} />
        </>
    );
}

const BYPASSES: [keyof Draft["conditions"], string, string][] = [
    ["bypassMonitoredOnly", "Bypass monitored channels", "Allows this trigger to search for matches in any channel."],
    ["bypassIgnoredChannels", "Bypass ignored channels", "Allows matching even in globally ignored channels."],
    ["bypassIgnoredGuilds", "Bypass ignored servers", "Allows matching even in globally ignored servers."],
    ["bypassForwardIgnoredGuilds", "Bypass forward ignored servers", "Allows forwarding even from globally forward-ignored servers."],
    ["bypassMatchAmbiguity", "Bypass match ambiguity", "Always treat this trigger as unambiguous, even if multiple triggers match simultaneously."],
    ["bypassLinkVerification", "Bypass link verification", "Skip Place ID verification for this trigger."],
    ["bypassLinkDeduplication", "Bypass link deduplication", "Skip the duplication check for this trigger."],
];

function BypassesSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const c = draft.conditions;
    return (
        <>
            <Note variant="danger">These skip global safety checks. Only turn them on if you know why.</Note>
            {BYPASSES.map(([key, label, hint]) => (
                <SwitchRow key={key} label={label} hint={hint} value={Boolean(c[key])} onChange={v => patch({ conditions: { ...c, [key]: v } })} />
            ))}
        </>
    );
}

// --- Registry: the side nav, its dots and the pages all come from here ---

export interface EditorSection {
    id: string;
    label: string;
    group: "required" | "optional";
    tech?: boolean;
    visible: (d: Draft) => boolean;
    configured: (d: Draft) => boolean;
    Component: React.ComponentType<{ draft: Draft; patch: Patch; }>;
}

export const SECTIONS: EditorSection[] = [
    { id: "essentials", label: "Essentials", group: "required", visible: () => true, configured: () => false, Component: EssentialsSection },
    { id: "lock", label: "Join lock", group: "optional", visible: () => true, configured: d => d.state.joinlock, Component: JoinLockSection },
    { id: "sound", label: "Sound", group: "optional", visible: d => d.state.notify, configured: d => Boolean(d.state.notificationSound), Component: SoundSection },
    { id: "biome", label: "Biome check", group: "optional", visible: d => hasBiomeCheck(d.type), configured: d => Boolean(d.biome?.detectionEnabled), Component: BiomeSection },
    { id: "forwarding", label: "Forwarding", group: "optional", visible: () => true, configured: d => d.forwarding.onMatch.enabled || d.forwarding.onDetection.enabled, Component: ForwardingSection },
    {
        id: "filters", label: "Filters", group: "optional", visible: () => true,
        configured: d => [d.conditions.fromUser, d.conditions.inChannel, d.conditions.ignoredChannels, d.conditions.ignoredGuilds].some(a => a.length > 0),
        Component: FiltersSection,
    },
    { id: "bypasses", label: "Bypasses", group: "optional", tech: true, visible: () => true, configured: d => BYPASSES.some(([k]) => Boolean(d.conditions[k])), Component: BypassesSection },
];

/** What's missing for the trigger to be useful. Shown as a warning on Essentials. */
export function missingEssentials(d: Draft): string[] {
    const missing: string[] = [];
    if (!d.name.trim()) missing.push("a name");
    if (!d.conditions.keywords.match.value.length && !d.conditions.mentionRoles.length) missing.push("a word or a role to match");
    return missing;
}

