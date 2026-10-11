/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { PluginNative } from "@utils/types";
import { React, TextInput } from "@webpack/common";

import { settings } from "../../../settings";
import { UIState } from "../../../stores/UIStateStore";
import { getEffectiveKillTargets } from "../../../utils";
import { ChipKind } from "../../ui/IdChipInput";
import { Note } from "../../ui/Note";
import { Block, BlockMaster } from "./Block";
import { DebugReport } from "./DebugReport";
import { BlockId, Overview } from "./Overview";
import { HelpTip, Setting } from "./Setting";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;

// --- Shared styles ---

const customRow: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    padding: "10px 14px",
    borderRadius: 8,
    background: "var(--background-mod-subtle)",
};

const customLabel: React.CSSProperties = {
    color: "var(--control-secondary-text-default)",
    fontSize: 14,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 6,
};

const customDescription: React.CSSProperties = {
    color: "var(--text-muted)",
    fontSize: 12,
    lineHeight: 1.4,
    marginTop: 2,
};

// --- Kill process check ---

type ProcessCheckResult = { pattern: string; matches: { pid: number; name: string; }[]; };

async function checkProcesses(matchBy: "name" | "title", patterns: string[]): Promise<ProcessCheckResult[]> {
    return Promise.all(patterns.map(async pattern => {
        const procs = matchBy === "title"
            ? await Native.getProcess({ type: "windowtitle", windowTitle: pattern })
            : await Native.getProcess({ type: "tasklist", processName: pattern });
        return { pattern, matches: procs.map(p => ({ pid: p.pid, name: p.name })) };
    }));
}

function ProcessCheckResults({ results }: { results: ProcessCheckResult[]; }) {
    return (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
            {results.length === 0 && (
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>No process names configured.</span>
            )}
            {results.map(r => r.matches.length === 0 ? (
                <span key={r.pattern} style={{ fontSize: 12, color: "var(--status-danger)" }}>
                    ❌ {r.pattern} - not found
                </span>
            ) : r.matches.map(m => (
                <span key={`${r.pattern}-${m.pid}`} style={{ fontSize: 12, color: "var(--status-positive)" }}>
                    ✅ {m.name} (PID {m.pid})
                </span>
            )))}
        </div>
    );
}

function useProcessCheck() {
    const [results, setResults] = React.useState<ProcessCheckResult[] | null>(null);
    const [checking, setChecking] = React.useState(false);

    const check = async () => {
        setChecking(true);
        setResults(null);
        const { matchBy, values } = getEffectiveKillTargets();
        setResults(await checkProcesses(matchBy, [...values]));
        setChecking(false);
    };

    return { results, checking, check };
}

// Used when a known macro preset is selected - there is no editable field to put the button next to.
function CheckProcessesButton() {
    settings.use(["macroType"]);
    const { results, checking, check } = useProcessCheck();

    return (
        <div style={customRow}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Button size="medium" variant="secondary" onClick={check} disabled={checking}>
                    {checking ? "Checking…" : "Check processes"}
                </Button>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    Lists the running processes this preset matches.
                </span>
            </div>
            {results && <ProcessCheckResults results={results} />}
        </div>
    );
}

// Used in Custom mode - the process name / window title input and the check button share one row.
function MacroProcessNameEntry() {
    const { killProcessNames, killMatchBy } = settings.use(["killProcessNames", "killMatchBy"]);
    const [raw, setRaw] = React.useState(killProcessNames ?? "");
    const { results, checking, check } = useProcessCheck();

    React.useEffect(() => setRaw(killProcessNames ?? ""), [killProcessNames]);

    const commit = (v: string) => { settings.store.killProcessNames = v; };

    const isTitle = killMatchBy === "title";

    return (
        <div data-sora-setting="killProcessNames" style={customRow}>
            <span style={customLabel}>
                {isTitle ? "Macro window title" : "Macro process name"}
                <HelpTip text={isTitle
                    ? "Window titles accept wildcards like FishSol*. Good for script macros (AutoHotkey) that share one interpreter process, so other scripts are not closed too."
                    : "Open Task Manager, go to the Details tab and copy the value under Name for your macro."}
                />
            </span>
            <span style={customDescription}>
                {isTitle
                    ? "Window title of the macro. Separate several with commas. Wildcards (*) help when the title has a version number."
                    : "Process name of the macro. Separate several with commas. Not case-sensitive. The file extension is optional but recommended."}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <TextInput
                    style={{ flex: 1 }}
                    value={raw}
                    onChange={setRaw}
                    onBlur={() => commit(raw)}
                    placeholder={isTitle ? "FishSol*" : "AutoHotkeyU64.exe, MacroTool.exe"}
                />
                <Button size="medium" variant="primary" onClick={check} disabled={checking}>
                    {checking ? "Checking…" : "Check"}
                </Button>
            </div>
            {results && <ProcessCheckResults results={results} />}
        </div>
    );
}

// --- ADB ---

function AdbSerialEntry() {
    const { ldpAdbDeviceSerial } = settings.use(["ldpAdbDeviceSerial"]);
    const [devicesOutput, setDevicesOutput] = React.useState<string | null>(null);
    const [checking, setChecking] = React.useState(false);

    const handleCheck = async () => {
        setChecking(true);
        setDevicesOutput(null);
        const result = await Native.listAdbDevices(settings.store.ldpAdbPath);
        setDevicesOutput(result.ok ? result.output : `Error: ${result.error}`);
        setChecking(false);
    };

    return (
        <div data-sora-setting="ldpAdbDeviceSerial" style={customRow}>
            <span style={customLabel}>Device serial</span>
            <span style={customDescription}>Serial of the target device. Default: emulator-5554</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
                <TextInput
                    style={{ flex: 1 }}
                    value={ldpAdbDeviceSerial ?? ""}
                    onChange={v => { settings.store.ldpAdbDeviceSerial = v; }}
                    placeholder="emulator-5554"
                />
                <Button size="medium" variant="primary" onClick={handleCheck} disabled={checking}>
                    {checking ? "Checking…" : "Check devices"}
                </Button>
            </div>
            {devicesOutput && (
                <pre style={{
                    margin: "6px 0 0",
                    padding: "8px 10px",
                    background: "var(--background-mod-strong)",
                    borderRadius: "var(--radius-sm, 4px)",
                    color: "var(--text-default)",
                    fontSize: 12,
                    fontFamily: "var(--font-code)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                }}>
                    {devicesOutput}
                </pre>
            )}
        </div>
    );
}

// --- Types ---

type SettingEntry = {
    id: keyof typeof settings.store;
    label: string;
    description?: string;
    tooltip?: string;
    chipKind?: ChipKind;
    tech?: boolean;
};

// Anything that is not a plain setting row (notes, check buttons). `search` is the text it matches against.
type CustomEntry = {
    key: string;
    search: string;
    node: React.ReactNode;
};

type Entry = SettingEntry | CustomEntry;

type BlockDef = {
    id: BlockId;
    title: string;
    subtitle: string;
    tooltip?: string;
    tech?: boolean;
    master?: BlockMaster;
    keepBodyVisible?: boolean;
    note?: React.ReactNode;
    entries: Entry[];
};

const isCustom = (e: Entry): e is CustomEntry => "node" in e;

const DEFAULT_OPEN: Record<BlockId, boolean> = {
    join: true,
    biome: true,
    verification: true,
    macro: true,
    monitoring: false,
    reading: false,
    forwarding: false,
    interface: false,
    other: false,
    adb: false,
};

const DELAY_DESCRIPTION = "Time to wait before acting. A cancel prompt shows during this delay.";

// --- SettingsTab ---

export function SettingsTab() {
    const {
        detectorEnabled,
        robloxToken,
        linkVerification,
        onBadLink,
        onBiomeFalse,
        onBiomeEnd,
        onBiomeTimeout,
        sendAdbSignal,
        sendKillProcessSignal,
        forwardingEnabled,
        macroType,
        joinMode,
    } = settings.use([
        "detectorEnabled",
        "robloxToken",
        "linkVerification",
        "onBadLink",
        "onBiomeFalse",
        "onBiomeEnd",
        "onBiomeTimeout",
        "sendAdbSignal",
        "sendKillProcessSignal",
        "forwardingEnabled",
        "macroType",
        "joinMode",
    ]);

    const [search, setSearch] = React.useState("");
    const [openBlocks, setOpenBlocks] = React.useState<Record<BlockId, boolean>>(() => ({ ...DEFAULT_OPEN, ...UIState.get("settingsBlocks") }));

    const verificationEnabled = linkVerification !== "disabled";
    const anyBiomeAction = onBiomeFalse !== "nothing" || onBiomeEnd !== "nothing" || onBiomeTimeout !== "nothing";
    // "Prepare ADB" actions use the ADB settings even when the close signal is off.
    const adbUsedByAction = [onBadLink, onBiomeFalse, onBiomeEnd, onBiomeTimeout].includes("prep-adb");

    const setOpen = (id: BlockId, open: boolean) => {
        setOpenBlocks(prev => ({ ...prev, [id]: open }));
        UIState.set("settingsBlocks", { [id]: open });
    };

    // Turning a feature on also unfolds its block, so its options are right there.
    const master = (id: BlockId, value: boolean, apply: (v: boolean) => void): BlockMaster => ({
        value,
        onChange: v => {
            apply(v);
            if (v) setOpen(id, true);
        },
    });

    const handleFix = (block: BlockId, setting: string) => {
        setSearch("");
        setOpen(block, true);
        setTimeout(() => {
            document.querySelector(`[data-sora-setting="${setting}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
    };

    // --- Blocks ---

    const blocks: BlockDef[] = [
        {
            id: "join",
            title: "Join behavior",
            subtitle: "How a snipe launches Roblox",
            entries: [
                {
                    id: "joinMode", label: "When Roblox is already open",
                    description: "What happens to the running game when a trigger fires.",
                    tooltip: "Unsafe launches the link without closing Roblox first. Sometimes Roblox bugs out and does not open over the running game. In Unsafe this fails silently: the snipe still counts, but Roblox never launches. Use Safe if you want launches you can rely on.",
                },
                ...(joinMode === "unsafe" ? [{
                    key: "unsafeNote",
                    search: "unsafe",
                    node: (
                        <Note variant="warning">
                            Unsafe: if Roblox fails to open over the running game, nothing tells you. The snipe still counts, but Roblox never launches.
                        </Note>
                    ),
                }] : []),
                { id: "privateServerLink", label: "Private server link", description: "Your own private server. Needed by any action set to join it." },
                { id: "deduplicateLinks", label: "Skip repeated links", description: "Ignore a link already seen in the last 10 minutes for the same trigger." },
                { id: "resolveAmbiguousLinks", label: "Use the first link when there are several", description: "A message with different link types, like a share link next to a private server link, is skipped by default. Turn this on to use the first one." },
            ],
        },
        {
            id: "biome",
            title: "Biome actions",
            subtitle: "What to do after a biome is detected",
            note: detectorEnabled
                ? <Note variant="warning">Biome detection is managed on the plugin page in Vencord's plugin menu. Changes there need a Discord restart.</Note>
                : <Note variant="warning">Biome detection is off, so these actions never run. Turn it on from the plugin page in Vencord's plugin menu, then restart Discord.</Note>,
            entries: [
                { id: "onBiomeFalse", label: "When the biome is fake", description: "The biome you joined does not match the announcement." },
                ...(onBiomeFalse !== "nothing" ? [{ id: "biomeFalseActionTimeout" as const, label: "Wait before acting (ms)", description: DELAY_DESCRIPTION }] : []),
                { id: "onBiomeEnd", label: "When a biome ends", description: "A confirmed biome has ended." },
                ...(onBiomeEnd !== "nothing" ? [{ id: "biomeEndActionTimeout" as const, label: "Wait before acting (ms)", description: DELAY_DESCRIPTION }] : []),
                { id: "onBiomeTimeout", label: "When detection times out", description: "No biome was detected in time." },
                ...(onBiomeTimeout !== "nothing" ? [{ id: "biomeTimeoutActionTimeout" as const, label: "Wait before acting (ms)", description: DELAY_DESCRIPTION }] : []),
                ...(anyBiomeAction ? [{ id: "skipActionConfirmation" as const, label: "Act without asking", description: "Run these actions immediately, with no cancel prompt." }] : []),
            ],
        },
        {
            id: "verification",
            title: "Link verification",
            subtitle: "Check that a server link is real",
            master: master("verification", verificationEnabled, v => { settings.store.linkVerification = v ? "before" : "disabled"; }),
            note: robloxToken
                ? <Note variant="warning">Your Roblox token is sensitive. Treat it like a password, never share it, and use an alt account when you can.</Note>
                : <Note variant="warning">Link verification needs your Roblox token. Add it on the plugin page in Vencord's plugin menu.</Note>,
            entries: [
                { id: "linkVerification", label: "Verification mode", description: "When to check that a server link is real." },
                { id: "allowedPlaceIds", label: "Allowed place IDs", description: "Comma-separated. Only links to these places are accepted. Leave empty to allow any place.", tech: true },
                { id: "onBadLink", label: "When a link is bad", description: "What to do when verification fails." },
            ],
        },
        {
            id: "macro",
            title: "Stop my macro",
            subtitle: "Close your macro when a snipe happens",
            tooltip: "SolRadar closes the macro by its process name or window title, like ending it in Task Manager. This keeps it from reporting a fake biome to its server.",
            master: master("macro", sendKillProcessSignal, v => { settings.store.sendKillProcessSignal = v; }),
            entries: [
                {
                    id: "macroType", label: "Macro", description: "Which macro to stop.",
                    tooltip: "Presets are names known for each macro. If a preset finds nothing, you may have renamed the .exe or your version ships under another name. Pick Custom and confirm the name yourself.",
                },
                ...(macroType === "custom" ? [{
                    id: "killMatchBy" as const, label: "Find the macro by", description: "How your Custom macro is located.",
                    tooltip: "Use Process Name for regular .exe tools. Use Window Title for script macros (AutoHotkey) that share one interpreter process, so other scripts are not closed too. Window titles accept wildcards (*).",
                }] : []),
                macroType === "custom"
                    ? { key: "macroTarget", search: "macro process name window title", node: <MacroProcessNameEntry /> }
                    : { key: "macroCheck", search: "check processes", node: <CheckProcessesButton /> },
            ],
        },
        {
            id: "monitoring",
            title: "Monitoring",
            subtitle: "Which servers, channels and users to listen to",
            entries: [
                { id: "monitoredGuilds", label: "Only monitor these servers", chipKind: "guild", description: "Leave empty to monitor all of your servers.", tooltip: "Adding even one server means every other server is silently ignored." },
                { id: "monitoredChannels", label: "Only monitor these channels", chipKind: "channel", description: "Leave empty to monitor every channel.", tooltip: "Adding even one channel means every other channel is silently ignored." },
                { id: "ignoredGuilds", label: "Always ignore these servers", chipKind: "guild", description: "Overrides every trigger. Good for servers with no-sniper rules." },
                { id: "ignoredChannels", label: "Always ignore these channels", chipKind: "channel", description: "Overrides every trigger." },
                { id: "ignoredUsers", label: "Always ignore these users", chipKind: "user", description: "Overrides every trigger." },
            ],
        },
        {
            id: "reading",
            title: "Reading messages",
            subtitle: "How embeds and links are read",
            entries: [
                { id: "flattenEmbeds", label: "Read embeds", description: "Also match triggers against embed titles and descriptions. Needed for macro servers that post biomes inside embeds." },
                { id: "advancedEmbedFlattening", label: "Deep embed reading", description: "Also read embed fields and message component URLs when reading embeds.", tech: true },
                { id: "interpretJoinguardLinks", label: "Accept Joinguard links", description: "Handle Sol's Stat Tracker Joinguard links. They open your browser for Cloudflare verification, so the place cannot be checked." },
                { id: "ignoreWebhookForwards", label: "Ignore SolRadar's own forwards", description: "Skip any message whose embed footer contains \"solradar\", so the plugin never reacts to its own webhooks.", tech: true },
            ],
        },
        {
            id: "forwarding",
            title: "Forwarding",
            subtitle: "Send matches to a Discord webhook",
            master: master("forwarding", forwardingEnabled, v => { settings.store.forwardingEnabled = v; }),
            entries: [
                { id: "globalWebhookUrl", label: "Global webhook URL", description: "Used when a trigger forwards but has no webhook of its own." },
                { id: "censorWebhooks", label: "Censor webhooks", description: "Redact sender and channel info in forwarded messages." },
                { id: "forwardIgnoredGuilds", label: "Never forward from these servers", chipKind: "guild", description: "Messages from these servers are never forwarded." },
            ],
        },
        {
            id: "interface",
            title: "Interface",
            subtitle: "Privacy and menus",
            entries: [
                { id: "anonymizeEverything", label: "Anonymize snipes", description: "Hides the author, server, channel, message and logs of each snipe in History. Turn it on before sharing screenshots.", tooltip: "Click an entry in Snipe History to reveal it on its own." },
                { id: "shouldCheckForUpdates", label: "Check for updates", description: "Look for a new SolRadar version on startup.", tooltip: "Runs at most once a day and shows a notification when an update is available." },
                { id: "useButtonsForOrderingTriggers", label: "Reorder triggers with buttons", description: "Use the ▲▼ buttons instead of drag and drop." },
                { id: "useTriggerTabContextMenu", label: "Trigger context menu", description: "Right-click a trigger for enable, edit, duplicate, export and remove. When off, right-click only toggles it." },
            ],
        },
        {
            id: "other",
            title: "Other",
            subtitle: "Small extras",
            entries: [
                { id: "hideInactiveIndicator", label: "Hide the inactive dot", description: "Hide the red dot on the menu button while auto-join is off." },
                { id: "customNotificationSoundDelay", label: "Notification sound delay (ms)", description: "Delay before a trigger's custom sound plays.", tech: true },
            ],
        },
        {
            id: "adb",
            title: "Emulator (ADB)",
            subtitle: "Close Roblox inside an Android emulator after joining",
            tech: true,
            master: master("adb", sendAdbSignal, v => { settings.store.sendAdbSignal = v; }),
            keepBodyVisible: adbUsedByAction,
            note: sendAdbSignal
                ? <Note>When a snipe triggers, SolRadar launches the join link and sends a close signal through ADB at the same time.</Note>
                : <Note variant="warning">The close signal is off, but an action uses Prepare ADB, so these settings still apply.</Note>,
            entries: [
                { id: "ldpAdbPath", label: "ADB path", description: "Full path to adb.exe." },
                { key: "adbSerial", search: "device serial adb devices", node: <AdbSerialEntry /> },
                { id: "ldpAdbPackageName", label: "Package name", description: "App to force-stop on the device. Default: com.roblox.client" },
                { id: "omitAdbErrorNotifications", label: "Silence ADB error notifications", description: "The error is still logged to the console.", tech: true },
            ],
        },
    ];

    // --- Filtering ---

    const q = search.trim().toLowerCase();

    const entryMatches = (e: Entry) => isCustom(e)
        ? e.search.toLowerCase().includes(q)
        : `${e.label} ${e.description ?? ""}`.toLowerCase().includes(q);

    const visibleBlocks = blocks
        .map(b => {
            if (!q || b.title.toLowerCase().includes(q)) return b;
            return { ...b, entries: b.entries.filter(entryMatches) };
        })
        .filter(b => !q || b.title.toLowerCase().includes(q) || b.entries.length > 0);

    const renderEntry = (e: Entry) => isCustom(e)
        ? <React.Fragment key={e.key}>{e.node}</React.Fragment>
        : <Setting key={e.id} id={e.id} label={e.label} description={e.description} tooltip={e.tooltip} chipKind={e.chipKind} tech={e.tech} />;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 20 }}>

            <TextInput
                value={search}
                onChange={setSearch}
                placeholder="Search settings…"
            />

            {!q && <Overview onFix={handleFix} />}

            {visibleBlocks.map(b => (
                <Block
                    key={b.id}
                    title={b.title}
                    subtitle={b.subtitle}
                    tooltip={b.tooltip}
                    tech={b.tech}
                    master={b.master}
                    keepBodyVisible={b.keepBodyVisible}
                    open={!!q || openBlocks[b.id]}
                    onToggle={() => setOpen(b.id, !openBlocks[b.id])}
                >
                    {b.note}
                    {b.entries.map(renderEntry)}
                </Block>
            ))}

            {visibleBlocks.length === 0 && (
                <Note>No settings found for "{search}".</Note>
            )}

            {!q && <DebugReport />}

        </div>
    );
}
