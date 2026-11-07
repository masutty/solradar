/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../../ui/choice.css";

import { Button } from "@components/Button";
import { copyToClipboard } from "@utils/clipboard";
import { React, showToast, TextInput, Tooltip, useEffect, useState } from "@webpack/common";

import { settings } from "../../../../settings";
import { isLocalIcon, resolveIcon, saveIconFile } from "../../../../stores/IconStore";
import { DEFAULT_BIOME, hasBiomeCheck, hasBiomeStatus, locksUntilBiomeEnds, Trigger, TriggerType, TYPE_COLORS } from "../../../../stores/TriggerStore";
import { TourAnchor, tourAnchor } from "../../../tour/TourAnchor";
import { IdChipInput } from "../../../ui/IdChipInput";
import { KeywordsInput } from "../../../ui/KeywordsInput";
import { Note } from "../../../ui/Note";
import { descriptionText, labelText } from "../../../ui/styles";
import { AudioField, NumberField, RoleChipInput, rowStacked, sectionHeading, SwitchRow, TextAreaField, TextField } from "./fields";
import { AccentField, FloatingPreview, FormatFields, MatchTimingField, ShowFields } from "./forwardEditor";
import { MatchPreview } from "./MatchPreview";

export type Draft = Omit<Trigger, "id">;
export type Patch = (p: Partial<Draft>) => void;

// --- Trigger types ---

export const TYPE_META: Record<TriggerType, { label: string; color: string; }> = {
    RARE_BIOME: { label: "Rare biome", color: TYPE_COLORS.RARE_BIOME },
    EVENT_BIOME: { label: "Event biome", color: TYPE_COLORS.EVENT_BIOME },
    BIOME: { label: "Biome", color: TYPE_COLORS.BIOME },
    WEATHER: { label: "Weather", color: TYPE_COLORS.WEATHER },
    MERCHANT: { label: "Merchant", color: TYPE_COLORS.MERCHANT },
    CUSTOM: { label: "Custom", color: TYPE_COLORS.CUSTOM },
};

export { hasBiomeCheck };

// --- Essentials ---

const ALWAYS_ALLOWED_DOMAINS = ["github.io", "githubusercontent.com", "cdn.discordapp.com"];

function useIconAllowed(iconUrl: string) {
    const [allowed, setAllowed] = useState<boolean | null>(null);
    useEffect(() => {
        if (!iconUrl || isLocalIcon(iconUrl)) return void setAllowed(null);
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
    const src = resolveIcon(draft.iconUrl);
    if (src && !broken) {
        return (
            <span style={{ width: size, height: size, borderRadius: size / 4.5, overflow: "hidden", flexShrink: 0, display: "block" }}>
                <img src={src} alt="" onError={() => setBroken(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
        // Without a biome there is nothing to confirm, so a forward on detection set earlier must not stay on
        forwarding: hasBiomeCheck(type) ? draft.forwarding : { ...draft.forwarding, onDetection: { enabled: false } },
    });

    return (
        <div style={rowStacked}>
            <span style={labelText}>Type</span>
            <span style={descriptionText}>What kind of event this trigger watches for</span>
            <div className="vc-sora-typegrid" role="group" aria-label="Trigger type">
                {(Object.keys(TYPE_META) as TriggerType[]).map(type => {
                    const meta = TYPE_META[type];
                    return (
                        <button key={type} type="button" className="vc-sora-typeopt" aria-pressed={draft.type === type} onClick={() => choose(type)}>
                            <i style={{ background: meta.color }} />
                            {meta.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function CoreTiles({ draft, patch }: { draft: Draft; patch: Patch; }) {
    // Same emojis as the trigger list, so each one is easy to spot there
    const toggles: [keyof Draft["state"], string, string][] = [
        ["enabled", "⚡ Enabled", "The trigger is active"],
        ["autojoin", "🎯 Auto-join", "Join as soon as it matches"],
        ["notify", "🔔 Notify", "Desktop alert on a match"],
    ];

    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
            {toggles.map(([key, label, hint]) => (
                <SwitchRow
                    key={key}
                    label={label}
                    hint={hint}
                    value={Boolean(draft.state[key])}
                    onChange={v => patch({ state: { ...draft.state, [key]: v } })}
                />
            ))}
        </div>
    );
}

function PencilIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
    );
}

// Name, icon and description together. Clicking the icon shows the field for its link.
function IdentityCard({ draft, patch, iconAllowed }: { draft: Draft; patch: Patch; iconAllowed: boolean | null; }) {
    const [editingIcon, setEditingIcon] = useState(false);
    const fileInput = React.useRef<HTMLInputElement>(null);

    const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
            patch({ iconUrl: await saveIconFile(file) });
        } catch (err) {
            showToast({ text: err instanceof Error ? err.message : "Could not read that image.", variant: "critical" });
        }
    };

    return (
        <div style={rowStacked} {...tourAnchor("editor.name")}>
            <span style={labelText}>Name, icon and description</span>
            <span style={descriptionText}>Click the icon to set a link or pick an image from your computer. The description is only for you</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <Tooltip text={editingIcon ? "Hide the icon link" : "Change the icon"}>
                    {props => (
                        <button {...props} type="button" className="vc-sora-iconpick" aria-label="Change the icon" aria-expanded={editingIcon} onClick={() => setEditingIcon(v => !v)}>
                            <TriggerIcon draft={draft} size={40} />
                            <span className="vc-sora-iconpick-edit"><PencilIcon /></span>
                        </button>
                    )}
                </Tooltip>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <TextInput value={draft.name} placeholder="Name, e.g. Glitched" onChange={(v: string) => patch({ name: v })} />
                </div>
            </div>
            {editingIcon && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <TextInput
                            value={isLocalIcon(draft.iconUrl) ? "" : draft.iconUrl}
                            placeholder={isLocalIcon(draft.iconUrl) ? "Using an image from your computer" : "Link to an image, e.g. https://cdn.discordapp.com/..."}
                            onChange={(v: string) => patch({ iconUrl: v })}
                            autoFocus
                        />
                    </div>
                    <Button size="small" variant="secondary" onClick={() => fileInput.current?.click()}>Choose file</Button>
                    {draft.iconUrl && <Button size="small" variant="secondary" onClick={() => patch({ iconUrl: "" })}>Remove</Button>}
                    <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={onFile} />
                </div>
            )}
            {iconAllowed === false && (
                <Note variant="warning">
                    This image probably won't load, because Discord only shows images from allowed sites. Use cdn.discordapp.com, imgur.com or githubusercontent.com instead. The trigger still works either way.
                </Note>
            )}
            <TextInput value={draft.description} placeholder="Description, e.g. what this trigger is for" onChange={(v: string) => patch({ description: v })} />
        </div>
    );
}

export function TriggerIdLine({ id }: { id: string; }) {
    const copy = () => {
        copyToClipboard(id);
        showToast({ text: "ID copied", variant: "success" });
    };
    return (
        <Tooltip text="Click to copy">
            {props => <button {...props} type="button" className="vc-sora-trigger-id" aria-label={`Copy trigger ID ${id}`} onClick={copy}>{id}</button>}
        </Tooltip>
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
            <TourAnchor id="editor.type"><TypePicker draft={draft} patch={patch} /></TourAnchor>
            <IdentityCard draft={draft} patch={patch} iconAllowed={iconAllowed} />

            <p style={sectionHeading}>What it does</p>
            <TourAnchor id="editor.actions"><CoreTiles draft={draft} patch={patch} /></TourAnchor>

            <p style={sectionHeading}>When it fires</p>
            <TourAnchor id="editor.keywords">
            <KeywordsInput
                label="Must contain"
                hint="At least one of these words"
                value={keywords.match.value}
                strict={keywords.match.strict}
                variant="match"
                onChangeValue={v => patchKeywords("match", { value: v })}
                onChangeStrict={v => patchKeywords("match", { strict: v })}
                placeholder="e.g. glitch, glitched"
            />
            <KeywordsInput
                label="Must not contain"
                hint="Any of these cancels the match"
                value={keywords.exclude.value}
                strict={keywords.exclude.strict}
                variant="exclude"
                onChangeValue={v => patchKeywords("exclude", { value: v })}
                onChangeStrict={v => patchKeywords("exclude", { strict: v })}
                placeholder="e.g. hunt, help, looking for"
            />
            </TourAnchor>
            <TourAnchor id="editor.roles">
                <RoleChipInput roles={draft.conditions.mentionRoles} onChange={roles => patch({ conditions: { ...draft.conditions, mentionRoles: roles } })} />
            </TourAnchor>
            {/* Last: it checks every way above that can fire the trigger */}
            <TourAnchor id="editor.preview">
            <MatchPreview
                triggerName={draft.name}
                matchKeywords={keywords.match.value}
                matchStrict={keywords.match.strict}
                excludeKeywords={keywords.exclude.value}
                excludeStrict={keywords.exclude.strict}
            />
            </TourAnchor>
        </>
    );
}

// --- Optional sections ---

function JoinLockSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const patchState = (p: Partial<Draft["state"]>) => patch({ state: { ...draft.state, ...p } });
    const { detectorEnabled, detectorAccounts } = settings.use(["detectorEnabled", "detectorAccounts"]);
    const untilBiomeEnds = locksUntilBiomeEnds(draft, { enabled: detectorEnabled, accounts: detectorAccounts });
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
                    hint="Lower numbers win, so only triggers with a lower number can join while this lock is on"
                    tooltip="1 is the highest. While the lock is on, only triggers with a lower number can still join."
                    value={draft.state.priority}
                    onChange={v => patchState({ priority: v })}
                />
                <NumberField
                    label="Lock for"
                    hint="How long other triggers stay blocked after this one joins"
                    unit="seconds"
                    disabledReason={untilBiomeEnds ?'Not used while "Lock until biome ends" is on. Change it in the Biome check section.' : undefined}
                    value={draft.state.joinlockDuration}
                    onChange={v => patchState({ joinlockDuration: v })}
                />
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
        <TourAnchor id="editor.biome">
            {!detectorEnabled && <Note variant="warning">Biome detection is off in the plugin settings, so this check won't run until you turn it on there.</Note>}
            {detectorEnabled && !detectorAccounts && <Note variant="warning">No Roblox accounts are set up for biome detection. Add one in the plugin settings.</Note>}
            <SwitchRow label="Confirm the biome" hint="After joining, read the Roblox logs to check the biome is real." value={biome.detectionEnabled} onChange={v => patchBiome({ detectionEnabled: v })} />
            {biome.detectionEnabled && <>
                <TextField
                    label="Biome name in the logs"
                    hint={`Case-insensitive. Empty uses the trigger name, "${draft.name.trim().toUpperCase() || "…"}"`}
                    tooltip='Matches the BloxstrapRPC "hoverText" field in the Roblox log.'
                    value={biome.detectionKeyword}
                    placeholder="e.g. GLITCHED"
                    onChange={v => patchBiome({ detectionKeyword: v })}
                />
                {draft.type === "CUSTOM" && !biome.detectionKeyword.trim() && (
                    <Note variant="warning">Custom triggers are often named after something that isn't a biome, like a boss. Type the biome it shows up in, or every join will look fake.</Note>
                )}
                <SwitchRow label="Skip if already there" hint="If you're already in this biome, don't join again. Still notifies." value={biome.skipRedundantJoin} onChange={v => patchBiome({ skipRedundantJoin: v })} />
                <SwitchRow
                    label="Lock until biome ends"
                    hint="Keep the join lock until the biome is over, instead of a fixed time."
                    tooltip="The lock lasts until the biome changes, you disconnect, or the Roblox log goes quiet for 5 minutes, and it replaces the lock duration. It needs biome detection with a Roblox account set up in the plugin settings, otherwise the lock lasts the fixed time."
                    disabledReason={!draft.state.joinlock ? "Turn on Join lock first." : undefined}
                    value={biome.lockUntilEnd}
                    onChange={v => patchBiome({ lockUntilEnd: v })}
                />
                {biome.lockUntilEnd && draft.state.joinlock && (
                    !detectorEnabled || !detectorAccounts.trim() ? (
                        <Note variant="warning">
                            {!detectorEnabled ? "Biome detection is off" : "No Roblox account is set up for biome detection"}, so "Lock until biome ends" won't be used. The lock lasts the fixed time from the Join lock section instead.
                        </Note>
                    ) : (
                        <Note variant="warning">
                            Make sure the Roblox account in the plugin settings is the one that actually joins. With the wrong account the biome is never detected, so the lock is released after the detection timeout instead of lasting the whole biome.
                        </Note>
                    )
                )}
            </>}
        </TourAnchor>
    );
}

function ForwardingSection({ draft, patch }: { draft: Draft; patch: Patch; }) {
    const { globalWebhookUrl } = settings.use(["globalWebhookUrl"]);
    const f = draft.forwarding;
    const patchF = (p: Partial<typeof f>) => patch({ forwarding: { ...f, ...p } });
    const hasWebhook = Boolean(f.webhookUrl.trim() || globalWebhookUrl?.trim());
    const card = f.format === "card";

    return (
        <>
            <Note variant="warning">Optional, and most people don't need it. Sending too many webhooks in a short time can hit Discord's rate limits and get the webhook disabled. Normal use is fine.</Note>
            <TextField
                label="Webhook URL"
                hint={globalWebhookUrl ? "Leave empty to use the global webhook from Settings." : "No global webhook is set in Settings, so add one here to forward."}
                value={f.webhookUrl}
                placeholder="https://discord.com/api/webhooks/..."
                onChange={v => patchF({ webhookUrl: v })}
            />
            {!hasWebhook && <Note variant="warning">No webhook is set, so nothing will be forwarded.</Note>}
            <MatchTimingField draft={draft} patch={patch} />
            {hasBiomeCheck(draft.type) && (
                <SwitchRow label="Forward on detection" hint="Send when the biome is confirmed. Needs biome detection set up." value={f.onDetection.enabled} onChange={v => patchF({ onDetection: { enabled: v } })} />
            )}
            <FormatFields draft={draft} patch={patch} />
            <TextAreaField label="Message text" hint={card ? "Sent above the card, outside it. Max 2000 characters." : "Sent outside the embed. Max 2000 characters."} value={f.webhookContent} placeholder="Optional" onChange={v => patchF({ webhookContent: v })} maxLength={2000} />
            <TextAreaField label={card ? "Card text" : "Embed text"} hint={card ? "Shown under the title, inside the card. Max 2000 characters." : "Added before the embed description. Max 2000 characters."} value={f.webhookEmbedDescription} placeholder="Optional" onChange={v => patchF({ webhookEmbedDescription: v })} maxLength={2000} />
            <AccentField draft={draft} patch={patch} />
            <ShowFields draft={draft} patch={patch} />
            <FloatingPreview draft={draft} />
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
            <SwitchRow label="Ignore edited messages" hint="Only fire on new messages, never on edits. Matters only when Check edited messages is on in Settings." value={c.ignoreEdits} onChange={v => patchC({ ignoreEdits: v })} />
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
    ["bypassGlobalExclude", "Bypass global excluded words", "Ignore the global \"Must not contain\" list from Settings for this trigger."],
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
    /** What this section has set, in a few words. Null when it is left at its defaults. */
    summary: (d: Draft) => string | null;
    Component: React.ComponentType<{ draft: Draft; patch: Patch; }>;
}

const count = (n: number, one: string, many: string) => n > 0 ? `${n} ${n === 1 ? one : many}` : null;
const joinParts = (parts: (string | null | false)[]) => parts.filter(Boolean).join(", ") || null;

export const SECTIONS: EditorSection[] = [
    { id: "essentials", label: "Essentials", group: "required", visible: () => true, summary: () => null, Component: EssentialsSection },
    {
        id: "lock", label: "Join lock", group: "optional", visible: () => true,
        summary: d => d.state.joinlock ? `Priority ${d.state.priority}, locks ${hasBiomeStatus(d) && d.biome?.lockUntilEnd ? "until the biome ends" : `for ${d.state.joinlockDuration}s`}` : null,
        Component: JoinLockSection,
    },
    { id: "sound", label: "Sound", group: "optional", visible: d => d.state.notify, summary: d => d.state.notificationSound ? "Plays a custom sound" : null, Component: SoundSection },
    { id: "biome", label: "Biome check", group: "optional", visible: d => hasBiomeCheck(d.type), summary: d => d.biome?.detectionEnabled ? "Checks the biome after joining" : null, Component: BiomeSection },
    {
        id: "forwarding", label: "Forwarding", group: "optional", visible: () => true,
        summary: d => {
            const when = [d.forwarding.onMatch.enabled && "on a match", d.forwarding.onDetection.enabled && "when the biome is confirmed"].filter(Boolean);
            return when.length ? `Forwards ${when.join(" and ")}` : null;
        },
        Component: ForwardingSection,
    },
    {
        id: "filters", label: "Filters", group: "optional", visible: () => true,
        summary: d => joinParts([
            count(d.conditions.fromUser.length, "user", "users"),
            count(d.conditions.inChannel.length, "channel", "channels"),
            count(d.conditions.ignoredChannels.length, "ignored channel", "ignored channels"),
            count(d.conditions.ignoredGuilds.length, "ignored server", "ignored servers"),
            d.conditions.ignoreEdits && "ignores edits",
        ]),
        Component: FiltersSection,
    },
    {
        id: "bypasses", label: "Bypasses", group: "optional", tech: true, visible: () => true,
        summary: d => joinParts(BYPASSES.filter(([k]) => Boolean(d.conditions[k])).map(([, label]) => label)),
        Component: BypassesSection,
    },
];

/** What's missing for the trigger to be useful. Shown as a warning on Essentials. */
export function missingEssentials(d: Draft): string[] {
    const missing: string[] = [];
    if (!d.name.trim()) missing.push("a name");
    if (!d.conditions.keywords.match.value.length && !d.conditions.mentionRoles.length) missing.push("a word or a role to match");
    return missing;
}

