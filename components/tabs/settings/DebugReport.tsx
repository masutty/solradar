/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { copyToClipboard } from "@utils/clipboard";
import { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import { React, ScrollerThin } from "@webpack/common";

import { getRecentLogs } from "../../../logger";
import { settings } from "../../../settings";
import { SnipeEntry, SnipeStore } from "../../../stores/SnipeStore";
import { UIState } from "../../../stores/UIStateStore";
import { parseCsv, PLUGIN_VERSION, showToast } from "../../../utils";
import { labelText, sectionTitle } from "../../ui/styles";
import { Block } from "./Block";
import { HelpTip } from "./Setting";

// The token is never part of the report, whatever the options say. Only whether it is set.
const NEVER_INCLUDED = new Set(["robloxToken"]);
const SKIPPED = new Set(["lastKnownPublishedChangelog"]);
// Only included as-is when "detailed information" is on.
const PRIVATE_TEXT = new Set(["privateServerLink", "globalWebhookUrl"]);
const PRIVATE_LISTS = new Set(["monitoredGuilds", "monitoredChannels", "ignoredGuilds", "ignoredChannels", "ignoredUsers", "forwardIgnoredGuilds", "detectorAccounts"]);
const LOG_LINES = 100;
const SNIPE_COUNT = 20;

// Where a snipe came from. Only included when "detailed information" is on.
function snipeOrigin(e: SnipeEntry) {
    return {
        guildName: e.guildName,
        guildId: e.guildId,
        channelName: e.channelName,
        authorName: e.authorName,
        authorId: e.authorId,
        messageJumpUrl: e.messageJumpUrl,
        processedMessageText: e.processedMessageText,
        link: e.link,
        joinUri: e.joinUri,
    };
}

function formatSnipe(e: SnipeEntry, detailed: boolean) {
    return {
        id: e.id,
        time: new Date(e.timestamp).toISOString(),
        trigger: { name: e.triggerName, type: e.triggerType, priority: e.triggerPriority },
        tags: e.tags,
        metrics: e.metrics,
        biomeDurationMs: e.biomeDurationMs,
        ...(detailed && snipeOrigin(e)),
        log: e.log.map(l => `${new Date(l.timestamp).toISOString()} [${l.level}] ${l.message}`),
    };
}

export function buildDebugReport({ detailed, includeLogs, includeSnipes }: { detailed: boolean; includeLogs: boolean; includeSnipes: boolean; }) {
    const store = settings.store as Record<string, unknown>;
    const values: Record<string, unknown> = {};

    for (const [key, def] of Object.entries(settings.def as Record<string, { type: OptionType; }>)) {
        if (def.type === OptionType.COMPONENT || SKIPPED.has(key) || NEVER_INCLUDED.has(key)) continue;
        const value = store[key];
        if (!detailed && PRIVATE_TEXT.has(key)) values[key] = value ? "[hidden]" : "";
        else if (!detailed && PRIVATE_LISTS.has(key)) values[key] = { count: parseCsv(value as string).size };
        else values[key] = value;
    }
    values.robloxToken = store.robloxToken ? "[set]" : "[not set]";

    return {
        report: "SolRadar debug report",
        generatedAt: new Date().toISOString(),
        pluginVersion: PLUGIN_VERSION,
        detailed,
        environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
        },
        settings: values,
        ...(includeSnipes && {
            recentSnipes: SnipeStore.getRecent(SNIPE_COUNT).map(e => formatSnipe(e, detailed)),
        }),
        ...(includeLogs && {
            recentLogs: getRecentLogs(LOG_LINES).map(e => `${new Date(e.time).toISOString()} [${e.level}] ${e.source}: ${e.message}`),
        }),
    };
}

const optionRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "6px 6px",
};

export function DebugReport() {
    const [open, setOpen] = React.useState(() => !!UIState.get("settingsBlocks").debugReport);
    const [detailed, setDetailed] = React.useState(false);
    const [includeLogs, setIncludeLogs] = React.useState(true);
    const [includeSnipes, setIncludeSnipes] = React.useState(true);

    const text = React.useMemo(
        () => open ? JSON.stringify(buildDebugReport({ detailed, includeLogs, includeSnipes }), null, 2) : "",
        [open, detailed, includeLogs, includeSnipes]
    );

    const handleCopy = () => {
        copyToClipboard(text);
        showToast("Debug report copied to the clipboard.", "success");
    };

    const handleSave = () => {
        const filename = `solradar-debug-${new Date().toISOString().slice(0, 10)}.json`;
        const data = new TextEncoder().encode(text);
        if (IS_DISCORD_DESKTOP) DiscordNative.fileManager.saveWithDialog(data, filename);
        else saveFile(new File([data], filename, { type: "application/json" }));
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--background-mod-normal)" }}>
            <p style={{ ...sectionTitle, margin: 0 }}>Help</p>
            <Block
                title="Debug report"
                subtitle={<>Something not working? Send your setup to the developer. <strong>Your Roblox token is NEVER included.</strong></>}
                open={open}
                onToggle={() => {
                    setOpen(!open);
                    UIState.set("settingsBlocks", { debugReport: !open });
                }}
            >
                <div style={optionRow}>
                    <span style={{ ...labelText, display: "flex", alignItems: "center", gap: 6 }}>
                        Include detailed information
                        <HelpTip text="Adds your private server link, webhook URL, the full lists of server, channel and user IDs, and where each snipe came from (server, channel, author, message and link). Detailed reports make link and filter problems much easier to find." />
                    </span>
                    <Switch checked={detailed} onChange={setDetailed} />
                </div>
                <div style={optionRow}>
                    <span style={labelText}>Include recent logs</span>
                    <Switch checked={includeLogs} onChange={setIncludeLogs} />
                </div>
                <div style={optionRow}>
                    <span style={labelText}>Include recent snipes</span>
                    <Switch checked={includeSnipes} onChange={setIncludeSnipes} />
                </div>
                <ScrollerThin style={{
                    maxHeight: 180,
                    margin: "6px 6px 0",
                    padding: "8px 10px",
                    background: "var(--background-mod-strong)",
                    borderRadius: "var(--radius-sm, 4px)",
                }}>
                    <pre style={{
                        margin: 0,
                        color: "var(--text-default)",
                        fontSize: 12,
                        fontFamily: "var(--font-code)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                    }}>
                        {text}
                    </pre>
                </ScrollerThin>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "6px 6px 0" }}>
                    <Button size="small" variant="secondary" onClick={handleSave}>Save as file</Button>
                    <Button size="small" variant="primary" onClick={handleCopy}>Copy report</Button>
                </div>
            </Block>
        </div>
    );
}
