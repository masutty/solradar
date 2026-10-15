/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Tour } from "../types";
import { makeEditorTour } from "./editor";
import { makeRecentJoinsTour } from "./recentJoins";
import { makeSettingsTour } from "./settings";
import { makeTriggersTour } from "./triggers";

// Tours hold JSX, so they are built on first use: JSX at module load runs before React exists
// Keyed by tour id. Tab tours use the tab's id.
const TOUR_FACTORIES: Record<string, () => Tour> = {
    recentJoins: makeRecentJoinsTour,
    triggers: makeTriggersTour,
    settings: makeSettingsTour,
    editor: makeEditorTour,
};

const built: Record<string, Tour> = {};

export function getTour(id: string): Tour | undefined {
    return built[id] ??= TOUR_FACTORIES[id]?.();
}
