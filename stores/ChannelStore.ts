/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";
import { useEffect, useState } from "@webpack/common";

import { Logger } from "../logger";
import type { ChannelInfo } from "../native";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../native")>;
const logger = new Logger("SolRadar.Channel");

// null: no git to read (or not read yet), which counts as a release install
let channel: ChannelInfo | null = null;
const listeners = new Set<(c: ChannelInfo | null) => void>();

/** Reads which branch this install runs. With `fetch`, dev also asks origin for new commits first. */
export async function refreshChannel(fetch = false): Promise<ChannelInfo | null> {
    try {
        channel = await Native.getChannelInfo(fetch);
        listeners.forEach(fn => fn(channel));
    } catch (e) {
        logger.error("Could not read the branch:", e);
    }
    return channel;
}

export function useChannel(): ChannelInfo | null {
    const [value, setValue] = useState(channel);

    useEffect(() => {
        setValue(channel);
        listeners.add(setValue);
        return () => { listeners.delete(setValue); };
    }, []);

    return value;
}
