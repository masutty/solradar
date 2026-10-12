/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { OpenPluginButton } from "./components/ui/buttons/OpenPluginButton";

export const ACTION_OPTIONS = [
    { label: "Nothing", value: "nothing" },
    { label: "Join a public server", value: "public" },
    { label: "Join your private server", value: "private" },
    { label: "Close Roblox", value: "close" },
    { label: "Launch Roblox home page", value: "home" },
    { label: "Prepare ADB", value: "prep-adb" },
] as const;

// ACTION_OPTIONS with `default` set on the given value
const actionOptions = (defaultValue: string) =>
    ACTION_OPTIONS.map(o => ({ ...o, default: o.value === defaultValue }));

// Known macros and how to find their process.
// key: setting value. label: shown in the dropdown. matchValue: comma-separated.
// matchBy: "name" for the process name, "title" for the window title
// (use "title" for script macros like AutoHotkey, where many scripts share one process).
export const MACRO_PRESETS: Record<string, { label: string; matchBy: "name" | "title"; matchValue: string; }> = {
    maxstellar: { label: "Maxstellar", matchBy: "title", matchValue: "maxstellar's Biome Macro - Running" },
    fishsol: { label: "FishSol", matchBy: "title", matchValue: "FishSol*" },
    coteab: { label: "Coteab", matchBy: "title", matchValue: "Coteab Macro*" },
    jjaram: { label: "J.JARAM", matchBy: "title", matchValue: "J.JARAM - Jirach1's Just Another Roblox Account Manager" },
    solscope: { label: "SolsScope", matchBy: "title", matchValue: "SolsScope*" },
};

const macroTypeOptions = (defaultValue: string) => [
    ...Object.entries(MACRO_PRESETS).map(([value, { label }]) => ({ label, value, default: value === defaultValue })),
    { label: "Custom", value: "custom", default: defaultValue === "custom" },
];

export const settings = definePluginSettings({

    _openPlugin: {
        type: OptionType.COMPONENT,
        description: "Use this button to open the plugin's menu if the button is hidden or not showing up.",
        component: OpenPluginButton,
    },

    showMessageDebugButton: {
        type: OptionType.BOOLEAN,
        description: "Show a debug button in the message hover menu. Clicking it analyses how the plugin would process that message.",
        default: false,
    },

    watchMessageEdits: {
        type: OptionType.BOOLEAN,
        description: "Experimental. Also check messages when they are edited, for people who post the link first and add the biome later. Edits on messages older than 1 minute and edits that keep the same biome are ignored.",
        default: false,
        hidden: true,
    },
    editEndedKeywords: {
        type: OptionType.STRING,
        description: "Comma-separated. An edit that contains one of these words is ignored, since people add them when the biome is over.",
        default: "ended, over, expired, finished, gone, closed, done",
        hidden: true,
    },

    // UI
    pluginIconLocation: {
        type: OptionType.SELECT,
        description: "Where to place the menu button",
        options: [
            { label: "Chat Bar (default)", value: "chatbar", default: true }, // most stable spot
            { label: "Title Bar", value: "titlebar" },
            { label: "Hidden (not recommended)", value: "hide" }
        ],
        restartNeeded: true
    },
    pluginIconShortcutAction: {
        type: OptionType.SELECT,
        description: "What to do when right-clicking the menu button",
        options: [
            { label: "Toggle global auto-join", value: "toggle_join" },
            { label: "Toggle global notifications", value: "toggle_notification" },
            { label: "Toggle both (default)", value: "toggle_both", default: true },
            { label: "Do nothing", value: "none" }
        ],
        hidden: true,
    },

    // Main behavior
    autoJoinEnabled: {
        type: OptionType.BOOLEAN,
        description: "Global auto-join state. Takes precedence over the trigger-specific setting.",
        default: false,
        hidden: true,
    },
    notificationEnabled: {
        type: OptionType.BOOLEAN,
        description: "Global notification state. Takes precedence over the trigger-specific setting.",
        default: false,
        hidden: true,
    },
    joinMode: {
        type: OptionType.SELECT,
        description: "How to handle the running Roblox instance when a trigger fires.",
        options: [
            { label: "Safe (close game if open)", value: "safe", default: true },
            { label: "Unsafe (launch without closing)", value: "unsafe" },
        ],
        hidden: true,
    },
    sendAdbSignal: {
        type: OptionType.BOOLEAN,
        description: "Send a close signal to the emulator via ADB after launching the join URI. Requires ADB configuration below.",
        default: false,
        hidden: true,
    },
    sendKillProcessSignal: {
        type: OptionType.BOOLEAN,
        description: "Try to kill any running macro process immediately on snipe.",
        default: false,
        hidden: true,
    },
    macroType: {
        type: OptionType.SELECT,
        description: "Select which macro you are using.",
        options: macroTypeOptions("custom"),
        hidden: true,
    },
    killMatchBy: {
        type: OptionType.SELECT,
        description: "Whether to match the Custom kill target by process name or by window title.",
        options: [
            { label: "Process Name", value: "name", default: true },
            { label: "Window Title", value: "title" },
        ],
        hidden: true,
    },
    killProcessNames: {
        type: OptionType.STRING,
        description: "Type what process names should be terminated once a snipe happens. You can provide multiple process names by separating each via comma. This is case-insensitive. File type is optional, but recommended.",
        default: "",
        hidden: true,
    },

    // Message handling
    flattenEmbeds: {
        type: OptionType.BOOLEAN,
        description: "Whether to merge embeds into the message content when checking for triggers. If you're monitoring a Macro server, you might want to enable this.",
        default: true,
        hidden: true,
    },
    deduplicateLinks: {
        type: OptionType.BOOLEAN,
        description: "Prevent duplicate links within a short period from being processed.",
        default: true,
        hidden: true,
    },
    privateServerLink: {
        type: OptionType.STRING,
        description: "Your private server URL, for actions which require it.",
        default: "",
        hidden: true,
    },

    // Advanced (best left at defaults)
    ignoreWebhookForwards: {
        // Extra safety on top of the existing self-forward loop protection
        type: OptionType.BOOLEAN,
        description: "With this enabled, if an embed footer contains the text 'solradar', it will be ignored. Only disable this if you know what you're doing!",
        default: true,
        hidden: true,
    },
    customNotificationSoundDelay: {
        type: OptionType.NUMBER,
        description: "Delay in milliseconds before playing the trigger's defined custom notification sound. Default: 0",
        default: 0,
        min: 0,
        max: 5000,
        hidden: true,
    },
    omitAdbErrorNotifications: {
        type: OptionType.BOOLEAN,
        description: "Omits the notification sent when an ADB kill signal fails. Will still get logged to the console. Default: false",
        default: false,
        hidden: true,
    },
    interpretJoinguardLinks: {
        type: OptionType.BOOLEAN,
        description: "Interpret Sol's Stat Tracker Join-guard links. Default: false",
        default: false,
        hidden: true,
    },
    resolveAmbiguousLinks: {
        type: OptionType.BOOLEAN,
        description: "When a message contains multiple Roblox links, pick the first one found instead of discarding the message. Default: false",
        default: false,
        hidden: true,
    },
    advancedEmbedFlattening: {
        type: OptionType.BOOLEAN,
        description: "Enable advanced embed flattening. Default: false",
        default: false,
        hidden: true,
    },

    // ADB (emulator)
    ldpAdbPath: {
        type: OptionType.STRING,
        description: "Path to adb.exe (e.g. C:\\LDPlayer\\LDPlayer9\\adb.exe)",
        default: "C:\\LDPlayer\\LDPlayer9\\adb.exe",
        hidden: true,
    },
    ldpAdbDeviceSerial: {
        type: OptionType.STRING,
        description: "ADB device serial (run 'adb devices' to check). Default: emulator-5554",
        default: "emulator-5554",
        hidden: true,
    },
    ldpAdbPackageName: {
        type: OptionType.STRING,
        description: "Package name to force-stop on the emulator.",
        default: "com.roblox.client",
        hidden: true,
    },

    // Webhooks
    forwardingEnabled: {
        type: OptionType.BOOLEAN,
        description: "Global forwarding state. When off, no trigger forwards, whatever its own setting.",
        default: true,
        hidden: true,
    },
    globalWebhookUrl: {
        type: OptionType.STRING,
        description: "Fallback webhook URL used when a trigger has forwarding enabled but no webhook configured. Triggers with their own webhook URL will use that instead.",
        default: "",
        hidden: true,
    },
    censorWebhooks: {
        type: OptionType.BOOLEAN,
        description: "If enabled, the fields 'Sent by' and 'Sent in' from webhook notifications will be redacted.",
        default: false,
        hidden: true,
    },
    forwardIgnoredGuilds: {
        type: OptionType.STRING,
        description: "Comma-separated list of guild IDs that are ignored when forwarding. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },

    // UI
    hideInactiveIndicator: {
        type: OptionType.BOOLEAN,
        description: "Whether to hide the red 'inactive' dot in menu button when joins are disabled.",
        default: true,
        hidden: true,
    },
    anonymizeEverything: {
        type: OptionType.BOOLEAN,
        description: "Hide all identifiers from the UI. Default: true",
        default: true,
        hidden: true,
    },
    shouldCheckForUpdates: {
        type: OptionType.BOOLEAN,
        description: "Whether to check for updates. Default: true",
        default: true,
        hidden: true,
    },
    useButtonsForOrderingTriggers: {
        type: OptionType.BOOLEAN,
        description: "Reorder triggers with ▲▼ buttons instead of dragging them.",
        default: false,
        hidden: true,
    },
    useTriggerTabContextMenu: {
        type: OptionType.BOOLEAN,
        description: "Right-click a trigger to open a menu with quick actions (enable/disable, edit, duplicate, export, remove). Disable to go back to right-click instantly toggling enabled/disabled.",
        default: true,
        hidden: true,
    },

    // Monitoring
    monitoredGuilds: {
        type: OptionType.STRING,
        description: "Comma-separated list of guild IDs that the plugin should monitor. If empty, all guilds will be monitored. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },
    monitoredChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs that the plugin should monitor. If empty, all channel will be monitored. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },
    ignoredGuilds: {
        type: OptionType.STRING,
        description: "Comma-separated list of guild IDs that are always ignored, regardless of what any trigger says. Use this for servers with no-sniper policies. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },
    ignoredChannels: {
        type: OptionType.STRING,
        description: "Comma-separated list of channel IDs that the plugin should ignore. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },
    ignoredUsers: {
        type: OptionType.STRING,
        description: "Comma-separated list of user IDs that the plugin should ignore. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },

    // Link verification
    linkVerification: {
        type: OptionType.SELECT,
        description: "When to verify links. Requires a robloxToken configured to work. If set to after, once a bad link is detected, the plugin will execute the onBadLink action.",
        options: [
            { label: "Disabled", value: "disabled", default: true },
            { label: "Before Joining (slower, safer)", value: "before" },
            { label: "After Joining", value: "after" },
        ],
        hidden: true,
    },
    robloxToken: {
        type: OptionType.STRING,
        description: "This is NOT required for the plugin to work! Your .ROBLOSECURITY cookie value. Required for link verification. Keep this private and never share it with anyone. Highly recommended to make an alt account just to use it's token for this. The plugin only uses it to verify if a server link is valid by making a request to Roblox's API. It does NOT store or transmit the token in any other way.",
        default: "",
    },
    onBadLink: {
        type: OptionType.SELECT,
        description: "What to do when a bad link is detected. A bad link is a server link that fails verification (e.g. because it's expired or fake).",
        options: actionOptions("public"),
        hidden: true,
    },
    onBiomeFalse: {
        type: OptionType.SELECT,
        description: "What to do when the detected biome is fake (expected biome doesn't match what was announced).",
        options: actionOptions("nothing"),
        hidden: true,
    },
    onBiomeEnd: {
        type: OptionType.SELECT,
        description: "What to do when the confirmed biome ends (biome changed or disconnected).",
        options: actionOptions("nothing"),
        hidden: true,
    },
    biomeFalseActionTimeout: {
        type: OptionType.NUMBER,
        description: "Delay (ms) before executing the onBiomeFalse action. During this window, a cancellation prompt is shown. Default: 10000",
        default: 10000,
        min: 0,
        max: 60000,
        hidden: true,
    },
    biomeEndActionTimeout: {
        type: OptionType.NUMBER,
        description: "Delay (ms) before executing the onBiomeEnd action. During this window, a cancellation prompt is shown. Default: 10000",
        default: 10000,
        min: 0,
        max: 60000,
        hidden: true,
    },
    onBiomeTimeout: {
        type: OptionType.SELECT,
        description: "What to do when biome detection times out (no biome detected within the timeout window).",
        options: actionOptions("nothing"),
        hidden: true,
    },
    biomeTimeoutActionTimeout: {
        type: OptionType.NUMBER,
        description: "Delay (ms) before executing the onBiomeTimeout action. During this window, a cancellation prompt is shown. Default: 10000",
        default: 10000,
        min: 0,
        max: 60000,
        hidden: true,
    },
    skipActionConfirmation: {
        type: OptionType.BOOLEAN,
        description: "Skip the cancellation prompt for onBiomeFalse, onBiomeEnd and onBiomeTimeout actions. The action executes immediately.",
        default: false,
        hidden: true,
    },
    allowedPlaceIds: {
        type: OptionType.STRING,
        description: "Comma-separated list of place IDs that are allowed to be joined. If empty, all place IDs are allowed. Example: `123456789012345678, 987654321098765432`",
        default: "",
        hidden: true,
    },

    // Biome detector (changes need a restart)
    detectorEnabled: {
        type: OptionType.BOOLEAN,
        description: "Enable biome detection. When active, the plugin reads your Roblox log files to verify whether the biome you joined actually matches what was announced. Requires at least one account configured below.",
        default: false,
        restartNeeded: true,
    },
    detectorAccounts: {
        type: OptionType.STRING,
        description: "Comma-separated list of Roblox usernames to monitor for biome detection. If empty, biome detection is disabled.",
        default: "",
        restartNeeded: true,
    },
    detectorTimeoutMs: {
        type: OptionType.NUMBER,
        description: "How long (in milliseconds) to wait for a biome to be detected after joining. If no biome is detected within this window, the join is marked as timed out and the join lock is released. Recommended: 30000",
        default: 30000,
        restartNeeded: true,
    },
    detectorIntervalMs: {
        type: OptionType.NUMBER,
        description: "How often (in milliseconds) the detector reads your Roblox log files. Lower values give faster detection but read the disk more frequently. Recommended: 5000. Advised to keep this above 1000 due to minimal returns.",
        default: 5000,
        restartNeeded: true,
    },

    // Internal state
    lastVersionCheck: {
        type: OptionType.NUMBER,
        description: "[internal] The last time the plugin checked for updates.",
        default: 0,
        hidden: true,
    },
    lastKnownPublishedVersion: {
        type: OptionType.STRING,
        description: "[internal] The last known published version of the plugin.",
        default: "",
        hidden: true,
    },
    lastKnownPublishedChangelog: {
        type: OptionType.STRING,
        description: "[internal] The last known published changelog of the plugin.",
        default: "",
        hidden: true,
    }
});
