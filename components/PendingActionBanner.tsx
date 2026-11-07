/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useEffect, useReducer, useState } from "@webpack/common";

import { PendingActionState, PendingActionStore } from "../services/ActionExecutor";
import { TimerIcon } from "./icons/BannerIcons";
import { DrainBanner } from "./ui/DrainBanner";

// --- Hook ---

export function usePendingAction(): PendingActionState | null {
    const [state, setState] = useState<PendingActionState | null>(() => PendingActionStore.current);
    useEffect(() => PendingActionStore.subscribe(setState), []);
    return state;
}

// --- Banner ---

export interface PendingActionBannerProps {
    style?: React.CSSProperties;
    className?: string;
}

export function PendingActionBanner({ style, className }: PendingActionBannerProps) {
    const pending = usePendingAction();
    const [, tick] = useReducer(x => x + 1, 0);

    useEffect(() => {
        if (!pending) return;
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [pending]);

    if (!pending) return null;

    const msLeft = PendingActionStore.msRemaining();

    return (
        <DrainBanner
            accent="var(--red-400)"
            icon={<TimerIcon size={22} />}
            title="Action pending"
            subtitle={pending.title}
            time={`${Math.ceil(msLeft / 1000)}s`}
            fraction={msLeft / pending.durationMs}
            onClick={() => PendingActionStore.cancel()}
            style={style}
            className={className}
        />
    );
}
