/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useEffect, useState } from "@webpack/common";

/** True while Shift is held. Used to reveal quick delete buttons. */
export function useShiftHeld() {
    const [held, setHeld] = useState(false);
    useEffect(() => {
        const down = (e: KeyboardEvent) => { if (e.key === "Shift") setHeld(true); };
        const up = (e: KeyboardEvent) => { if (e.key === "Shift") setHeld(false); };
        const blur = () => setHeld(false);
        window.addEventListener("keydown", down);
        window.addEventListener("keyup", up);
        window.addEventListener("blur", blur);
        return () => {
            window.removeEventListener("keydown", down);
            window.removeEventListener("keyup", up);
            window.removeEventListener("blur", blur);
        };
    }, []);
    return held;
}
