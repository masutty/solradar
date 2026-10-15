/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect } from "@webpack/common";

import { shouldAutoStart, TourStore } from "../../stores/TourStore";
import { getTour } from "./tours";

// Lets the tab lay out and stores load before the first spotlight
const AUTO_START_DELAY_MS = 400;

/** Starts a tour the first time the tab or modal that owns it shows. */
export function useAutoTour(id: string) {
    useEffect(() => {
        const tour = getTour(id);
        if (!tour || !shouldAutoStart(tour)) return;
        const timer = setTimeout(() => {
            if (!TourStore.get().tour) TourStore.start(tour);
        }, AUTO_START_DELAY_MS);
        return () => clearTimeout(timer);
    }, [id]);
}
