/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useReducer } from "@webpack/common";

import { JoinLockStore, useJoinLock } from "../stores/JoinLockStore";
import { LockIcon } from "./icons/BannerIcons";
import { DrainBanner } from "./ui/DrainBanner";

// --- Types ---

export interface JoinLockBannerProps {
    style?: React.CSSProperties;
    className?: string;
}

function formatClock(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
}

// --- Component ---

export function JoinLockBanner({ style, className }: JoinLockBannerProps) {
    const lock = useJoinLock();
    const [, tick] = useReducer(x => x + 1, 0);

    React.useEffect(() => {
        if (!lock || lock.lockedUntil === Infinity) return;
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [lock]);

    if (!lock) return null;

    // Until the biome ends there is nothing to count down, so the fill stays full
    const openEnded = lock.lockedUntil === Infinity;
    const msLeft = JoinLockStore.msRemaining();

    return (
        <DrainBanner
            accent="var(--yellow-300)"
            icon={<LockIcon size={22} />}
            title="Joins locked"
            subtitle={`${lock.triggerName} · priority ${lock.priority} or higher is ignored`}
            time={openEnded ? "Until biome ends" : formatClock(Math.ceil(msLeft / 1000))}
            fraction={openEnded ? 1 : msLeft / (lock.durationSeconds * 1000)}
            onClick={() => JoinLockStore.release()}
            style={style}
            className={className}
        />
    );
}
