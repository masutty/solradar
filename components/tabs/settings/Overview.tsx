/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { React } from "@webpack/common";

import { settings } from "../../../settings";
import { parseCsv } from "../../../utils";
import { COLORS, descriptionText, labelText, rowCard, sectionTitle } from "../../ui/styles";

export type BlockId = "join" | "biome" | "verification" | "macro" | "monitoring" | "reading" | "forwarding" | "interface" | "other" | "adb";

type Check = {
    kind: "warn" | "info" | "ok";
    text: string;
    fix?: { block: BlockId; setting: string; };
};

const OVERVIEW_KEYS = [
    "autoJoinEnabled", "privateServerLink", "onBadLink", "onBiomeFalse", "onBiomeEnd", "onBiomeTimeout",
    "sendKillProcessSignal", "macroType", "killProcessNames", "sendAdbSignal", "ldpAdbPath",
    "monitoredGuilds", "anonymizeEverything", "linkVerification", "robloxToken", "joinMode",
] as const;

const VERIFICATION_LABELS: Record<string, string> = { disabled: "Disabled", before: "Before joining", after: "After joining" };

function getChecks(s: Pick<typeof settings.store, typeof OVERVIEW_KEYS[number]>): Check[] {
    const checks: Check[] = [];
    const actions = [s.onBadLink, s.onBiomeFalse, s.onBiomeEnd, s.onBiomeTimeout];
    const monitored = parseCsv(s.monitoredGuilds).size;

    if (!s.autoJoinEnabled)
        checks.push({ kind: "warn", text: "Auto-join is paused. No trigger will join." });
    if (actions.includes("private") && !s.privateServerLink)
        checks.push({ kind: "warn", text: "An action joins your private server, but no link is set.", fix: { block: "join", setting: "privateServerLink" } });
    if (s.sendKillProcessSignal && s.macroType === "custom" && !s.killProcessNames?.trim())
        checks.push({ kind: "warn", text: "Stop my macro is on, but no custom target is set.", fix: { block: "macro", setting: "killProcessNames" } });
    if (s.sendAdbSignal && !s.ldpAdbPath?.trim())
        checks.push({ kind: "warn", text: "Emulator (ADB) is on, but no adb.exe path is set.", fix: { block: "adb", setting: "ldpAdbPath" } });
    if (s.linkVerification !== "disabled" && !s.robloxToken)
        checks.push({ kind: "warn", text: "Link verification needs your Roblox token. Add it on the plugin page in Vencord's plugin menu." });

    if (monitored > 0)
        checks.push({ kind: "info", text: `Only ${monitored} ${monitored === 1 ? "server is" : "servers are"} monitored. Every other server is ignored.` });
    if (!s.anonymizeEverything)
        checks.push({ kind: "info", text: "Snipes are visible in History. Turn on Anonymize snipes before sharing screenshots." });
    if (s.linkVerification === "disabled")
        checks.push({ kind: "info", text: "Links are not verified." });

    if (!checks.some(c => c.kind === "warn"))
        checks.unshift({ kind: "ok", text: "Everything SolRadar needs is configured." });

    return checks;
}

const KIND_COLOR: Record<Check["kind"], string> = {
    warn: COLORS.warning,
    info: COLORS.muted,
    ok: COLORS.positive,
};
const ICON_TEXT: Record<Check["kind"], string> = { warn: "!", info: "i", ok: "✓" };
const MAX_VISIBLE_CHECKS = 3;

function ToggleTile({ label, description, value, onChange }: {
    label: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div style={{ ...rowCard, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={labelText}>{label}</span>
                <span style={descriptionText}>{description}</span>
            </div>
            <Switch checked={value} onChange={onChange} />
        </div>
    );
}

function Fact({ label, value, color }: { label: string; value: string; color: string; }) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
            padding: "8px 10px",
            borderRadius: 8,
            background: `color-mix(in srgb, ${color} 12%, transparent)`,
        }}>
            <span style={{ ...sectionTitle, margin: 0, fontSize: 10, color: `color-mix(in srgb, ${color} 85%, var(--text-default))` }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{value}</span>
        </div>
    );
}

function CheckRow({ check, onFix }: { check: Check; onFix: (block: BlockId, setting: string) => void; }) {
    const color = KIND_COLOR[check.kind];
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 6,
            background: check.kind === "warn" ? `color-mix(in srgb, ${color} 10%, transparent)` : "none",
        }}>
            <span style={{
                flexShrink: 0,
                width: 18,
                height: 18,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 11,
                fontWeight: 700,
                color,
                background: `color-mix(in srgb, ${color} 18%, transparent)`,
            }}>{ICON_TEXT[check.kind]}</span>
            <span style={{ flex: 1, fontSize: 13, color: check.kind === "info" ? COLORS.muted : COLORS.label }}>{check.text}</span>
            {check.fix && (
                <Button size="min" variant="secondary" onClick={() => onFix(check.fix!.block, check.fix!.setting)}>
                    Fix
                </Button>
            )}
        </div>
    );
}

export function Overview({ onFix }: { onFix: (block: BlockId, setting: string) => void; }) {
    const s = settings.use([...OVERVIEW_KEYS, "notificationEnabled"]);
    const [showAll, setShowAll] = React.useState(false);

    const checks = getChecks(s);
    const visible = showAll ? checks : checks.slice(0, MAX_VISIBLE_CHECKS);
    const monitored = parseCsv(s.monitoredGuilds).size;

    const divider: React.CSSProperties = { borderTop: "1px solid var(--background-mod-subtle)" };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 14, borderRadius: 10, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
                <ToggleTile
                    label="Auto-join"
                    description="Join when a trigger matches."
                    value={s.autoJoinEnabled}
                    onChange={v => { settings.store.autoJoinEnabled = v; }}
                />
                <ToggleTile
                    label="Notifications"
                    description="Desktop alert on a match."
                    value={s.notificationEnabled}
                    onChange={v => { settings.store.notificationEnabled = v; }}
                />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                <Fact
                    label="Join mode"
                    value={s.joinMode === "unsafe" ? "Unsafe" : "Safe"}
                    color={s.joinMode === "unsafe" ? COLORS.warning : COLORS.positive}
                />
                <Fact
                    label="Verification"
                    value={VERIFICATION_LABELS[s.linkVerification] ?? s.linkVerification}
                    color={s.linkVerification === "disabled" ? COLORS.muted : COLORS.positive}
                />
                <Fact
                    label="Monitoring"
                    value={monitored ? `${monitored} ${monitored === 1 ? "server" : "servers"}` : "All servers"}
                    color={monitored ? COLORS.warning : COLORS.brand}
                />
            </div>

            <div style={{ ...divider, display: "flex", flexDirection: "column", gap: 2, paddingTop: 10 }}>
                {visible.map(c => <CheckRow key={c.text} check={c} onFix={onFix} />)}
                {checks.length > MAX_VISIBLE_CHECKS && (
                    <button
                        type="button"
                        onClick={() => setShowAll(v => !v)}
                        style={{ alignSelf: "flex-start", margin: "4px 8px 0", background: "none", border: "none", padding: 0, color: "var(--text-link)", cursor: "pointer", fontSize: 12, fontWeight: 500 }}
                    >
                        {showAll ? "Show less" : `Show ${checks.length - MAX_VISIBLE_CHECKS} more`}
                    </button>
                )}
            </div>
        </div>
    );
}
