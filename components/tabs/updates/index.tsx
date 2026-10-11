/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./updates.css";

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { openUserProfile } from "@utils/discord";
import { Alerts, React, Tooltip } from "@webpack/common";

import { settings } from "../../../settings";
import { ChangelogEntry, ChangelogVersion } from "../../../types";
import {
    checkForUpdates,
    getCurrentChangelog,
    getCurrentVersion,
    getLatestKnownChangelog,
    getLatestKnownVersion,
    hasNewVersionAvailable,
} from "../../../utils";
import { COLORS, sectionTitle, tabColumn } from "../../ui/styles";
import { Block } from "../settings/Block";

// --- Data ---

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

const ROLE_COLOR: Record<CreditRole, string> = {
    Author: "var(--brand-500)",
    Credits: "hsl(140deg 50% 44%)",
    Thanks: "hsl(38deg 95% 50%)",
    Framework: "hsl(270deg 60% 58%)",
};

const TYPE_ORDER = ["Added", "Improved", "Fixed", "Removed", "Other"];

const TYPE_COLOR: Record<string, string> = {
    Added: "hsl(140deg 50% 44%)",
    Improved: "hsl(210deg 80% 60%)",
    Fixed: "hsl(38deg 95% 50%)",
    Removed: "hsl(0deg 75% 60%)",
    Other: "var(--text-muted)",
};

const STATUS_COLOR = {
    ok: COLORS.positive,
    update: COLORS.warning,
    error: COLORS.danger,
};

// --- Alert content ---

function AlertBody({ intro, children }: { intro: string; children: React.ReactNode; }) {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Paragraph>{intro}</Paragraph>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
        </div>
    );
}

function AlertPoint({ icon, tone, children }: { icon: string; tone?: "warning" | "danger"; children: React.ReactNode; }) {
    const color = tone === "danger" ? COLORS.danger : tone === "warning" ? COLORS.warning : null;
    return (
        <div style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "8px 10px",
            borderRadius: 6,
            background: color ? `color-mix(in srgb, ${color} 10%, transparent)` : "var(--background-mod-subtle)",
        }}>
            <span style={{ fontSize: 16, lineHeight: "20px", flexShrink: 0 }}>{icon}</span>
            <span style={{ fontSize: 14, lineHeight: "20px", color: color ?? COLORS.text }}>{children}</span>
        </div>
    );
}

interface LinkEntry {
    label: string;
    icon: string;
    tooltip: string;
    onClick: () => void;
}

const LINKS: LinkEntry[] = [
    {
        label: "Source",
        icon: "🔗",
        tooltip: "Source code on GitLab",
        onClick: () => window.open("https://gitlab.com/masutty/solradar", "_blank"),
    },
    {
        label: "Installer",
        icon: "📦",
        tooltip: "Get SolRadar Installer, also used to update",
        onClick: () => window.open("https://gitlab.com/masutty/solradar-installer", "_blank"),
    },
    {
        label: "Discord",
        icon: "💬",
        tooltip: "Join the SolRadar support server",
        onClick: () => Alerts.show({
            title: "Join the support server?",
            body: (
                <AlertBody intro="Support, announcements, bug reports and ideas for SolRadar all happen there.">
                    <AlertPoint icon="⚠️" tone="warning">
                        Moderators from other communities may be there too, and could warn you just for joining.
                    </AlertPoint>
                    <AlertPoint icon="🙈">
                        If that worries you, join with an alt account, or use Help to message me privately.
                    </AlertPoint>
                </AlertBody>
            ),
            confirmText: "Join server",
            cancelText: "Cancel",
            onConfirm: () => window.open("https://discord.gg/EfWHGGz7MG", "_blank"),
        }),
    },
    {
        label: "Help",
        icon: "🆘",
        tooltip: "I need help: message masutty directly",
        onClick: () => Alerts.show({
            title: "Message masutty?",
            body: (
                <AlertBody intro="This opens my profile. Message me about bugs, problems with the plugin, or ideas for new features.">
                    <AlertPoint icon="⏳">
                        I might be busy, so I may not answer right away.
                    </AlertPoint>
                    <AlertPoint icon="⚙️" tone="warning">
                        Please don't ask for "faster joins" or special configs. The defaults are what I use and recommend.
                    </AlertPoint>
                    <AlertPoint icon="🚫" tone="danger">
                        Repeated messages or spam may get you blocked without warning.
                    </AlertPoint>
                    <AlertPoint icon="🧾">
                        Tip: attach a debug report (Settings tab, at the bottom) so I can see your setup.
                    </AlertPoint>
                </AlertBody>
            ),
            confirmText: "Open profile",
            cancelText: "Cancel",
            onConfirm: () => openUserProfile("188851299255713792"),
        }),
    },
];

// --- Helpers ---

function timeAgo(ms: number): string {
    const minutes = Math.round((Date.now() - ms) / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    const days = Math.round(hours / 24);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// The local version.json only knows releases up to the installed one, so a newer
// published release is added on top from what the last update check saved.
function getReleases(updateAvailable: boolean): ChangelogVersion[] {
    const local = getCurrentChangelog();
    const latest = getLatestKnownVersion();
    if (!updateAvailable || !latest || local.some(r => r.version === latest)) return local;
    return [{ version: latest, entries: getLatestKnownChangelog() }, ...local];
}

// --- Status card ---

type CheckState = "idle" | "checking" | "error";

function StatusCard({ updateAvailable, latestVersion, checkState, lastCheck, onCheck }: {
    updateAvailable: boolean;
    latestVersion: string | null;
    checkState: CheckState;
    lastCheck: number;
    onCheck: () => void;
}) {
    const currentVersion = getCurrentVersion();
    const checking = checkState === "checking";
    const failed = checkState === "error";

    const title = checking ? "Checking for updates"
        : failed ? "Couldn't check for updates"
            : updateAvailable ? "Update available"
                : "You're up to date";

    const color = failed ? STATUS_COLOR.error : updateAvailable ? STATUS_COLOR.update : STATUS_COLOR.ok;
    const icon = checking ? "…" : failed ? "!" : updateAvailable ? "↑" : "✓";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 18, borderRadius: 10, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    fontSize: 18,
                    fontWeight: 800,
                    color,
                    background: `color-mix(in srgb, ${color} 15%, transparent)`,
                }}>{icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-default)" }}>{title}</div>
                    <div style={{ fontSize: 13, fontFamily: "var(--font-code)", color: "var(--text-muted)" }}>
                        {updateAvailable && latestVersion ? `v${currentVersion} → v${latestVersion}` : `v${currentVersion}`}
                    </div>
                </div>
            </div>

            {updateAvailable && !checking ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-default)" }}>
                    <span>How to update</span>
                    <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4, color: "var(--text-muted)" }}>
                        <li>Run SolRadar Installer again, or run <code>git pull</code> in the plugin folder and rebuild Vencord.</li>
                        <li>Restart Discord.</li>
                    </ol>
                </div>
            ) : !checking && (
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {failed
                        ? "The update server didn't answer. Try again in a bit."
                        : lastCheck ? `Last checked ${timeAgo(lastCheck)}.` : "Not checked yet."}
                </span>
            )}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", paddingTop: 12, borderTop: "1px solid var(--background-mod-subtle)" }}>
                {LINKS.map(link => (
                    <Tooltip key={link.label} text={link.tooltip}>
                        {props => (
                            <Button {...props} size="small" variant="secondary" onClick={link.onClick}>
                                {link.icon} {link.label}
                            </Button>
                        )}
                    </Tooltip>
                ))}
                <Tooltip text={checking ? "Checking for updates…" : "Check for updates now"}>
                    {props => (
                        <Button
                            {...props}
                            size="small"
                            variant="secondary"
                            onClick={onCheck}
                            disabled={checking}
                            aria-label="Check for updates now"
                        >
                            <svg className={checking ? "vc-sora-spin" : undefined} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                            </svg>
                        </Button>
                    )}
                </Tooltip>
            </div>
        </div>
    );
}

// --- Changelog ---

function GroupedEntries({ entries }: { entries: ChangelogEntry[]; }) {
    return (
        <>
            {TYPE_ORDER.map(type => {
                const group = entries.filter(e => (TYPE_ORDER.includes(e.type) ? e.type : "Other") === type);
                if (!group.length) return null;
                return (
                    <div key={type} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TYPE_COLOR[type], padding: "0 2px" }}>
                            {type}
                        </span>
                        {group.map((e, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", borderRadius: 8, background: "var(--background-mod-subtle)" }}>
                                <span style={{ fontSize: 13, color: "var(--text-default)" }}>{e.text}</span>
                                {e.description && (
                                    <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{e.description}</span>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </>
    );
}

// Newest release first. The installed one (and a new one, if any) start open.
function ReleaseList({ releases, newVersion }: { releases: ChangelogVersion[]; newVersion: string | null; }) {
    const currentVersion = getCurrentVersion();
    const [open, setOpen] = React.useState<Record<string, boolean>>({});

    const isOpen = (version: string) => open[version] ?? (version === currentVersion || version === newVersion);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {releases.map(r => (
                <Block
                    key={r.version}
                    title={`v${r.version}`}
                    titleExtra={
                        r.version === currentVersion
                            ? <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-brand)" }}>{"< yours"}</span>
                            : r.version === newVersion
                                ? <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, color: STATUS_COLOR.update, background: `color-mix(in srgb, ${STATUS_COLOR.update} 15%, transparent)` }}>New</span>
                                : undefined
                    }
                    open={isOpen(r.version)}
                    onToggle={() => setOpen(prev => ({ ...prev, [r.version]: !isOpen(r.version) }))}
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 6px" }}>
                        <GroupedEntries entries={r.entries} />
                    </div>
                </Block>
            ))}
        </div>
    );
}

// --- Credits ---

function CreditCard({ entry }: { entry: CreditEntry; }) {
    const color = ROLE_COLOR[entry.role];
    const body = (
        <>
            <span style={{
                width: 34,
                height: 34,
                flexShrink: 0,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 15,
                fontWeight: 700,
                color,
                background: `color-mix(in srgb, ${color} 18%, transparent)`,
            }}>
                {entry.name[0].toUpperCase()}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0, flex: 1 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{entry.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color }}>{entry.role}</span>
                </span>
                {entry.note && <span style={{ fontSize: 12, color: COLORS.muted, lineHeight: 1.35 }}>{entry.note}</span>}
            </span>
            {entry.url && <span className="vc-sora-credit-arrow" aria-hidden="true">↗</span>}
        </>
    );

    if (!entry.url) return <div className="vc-sora-credit">{body}</div>;

    return (
        <Tooltip text={entry.url.replace(/^https?:\/\//, "")}>
            {props => (
                <a {...props} className="vc-sora-credit vc-sora-credit-link" href={entry.url} target="_blank" rel="noreferrer">
                    {body}
                </a>
            )}
        </Tooltip>
    );
}

// --- UpdatesTab ---

export function UpdatesTab() {
    const { lastVersionCheck, lastKnownPublishedVersion } = settings.use(["lastVersionCheck", "lastKnownPublishedVersion"]);
    const [checkState, setCheckState] = React.useState<CheckState>("idle");

    const updateAvailable = hasNewVersionAvailable();
    const releases = getReleases(updateAvailable);

    const handleCheck = async () => {
        setCheckState("checking");
        const ok = await checkForUpdates();
        setCheckState(ok ? "idle" : "error");
    };

    return (
        <div style={tabColumn}>
            <StatusCard
                updateAvailable={updateAvailable}
                latestVersion={lastKnownPublishedVersion || null}
                checkState={checkState}
                lastCheck={lastVersionCheck ?? 0}
                onCheck={handleCheck}
            />

            <p style={sectionTitle}>Credits</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
                {CREDITS.map(entry => <CreditCard key={entry.name} entry={entry} />)}
            </div>

            <p style={sectionTitle}>Changelog</p>
            <ReleaseList releases={releases} newVersion={updateAvailable ? lastKnownPublishedVersion : null} />
        </div>
    );
}
