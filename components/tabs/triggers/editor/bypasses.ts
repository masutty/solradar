/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BypassKey } from "../../../../stores/TriggerStore";

export const BYPASSES: [BypassKey, string, string][] = [
    ["bypassMonitoredOnly", "Bypass monitored channels", "Allows this trigger to search for matches in any channel."],
    ["bypassIgnoredChannels", "Bypass ignored channels", "Allows matching even in globally ignored channels."],
    ["bypassIgnoredGuilds", "Bypass ignored servers", "Allows matching even in globally ignored servers."],
    ["bypassIgnoredUsers", "Bypass ignored users", "Allows matching even from globally ignored users."],
    ["bypassForwardIgnoredGuilds", "Bypass forward ignored servers", "Allows forwarding even from globally forward-ignored servers."],
    ["bypassMatchAmbiguity", "Bypass match ambiguity", "Always treat this trigger as unambiguous, even if multiple triggers match simultaneously."],
    ["bypassLinkVerification", "Bypass link verification", "Skip Place ID verification for this trigger."],
    ["bypassLinkDeduplication", "Bypass link deduplication", "Skip the duplication check for this trigger."],
    ["bypassGlobalExclude", "Bypass global excluded words", "Ignore the global \"Must not contain\" list from Settings for this trigger."],
];
