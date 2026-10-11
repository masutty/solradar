/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, useEffect, useReducer, useState } from "@webpack/common";

import { PendingActionState, PendingActionStore } from "../services/ActionExecutor";

// --- Hook ---

export function usePendingAction(): PendingActionState | null {
    const [state, setState] = useState<PendingActionState | null>(() => PendingActionStore.current);
    useEffect(() => PendingActionStore.subscribe(setState), []);
    return state;
}

// --- Banner ---

export type PendingActionBannerVariant = "minimal" | "full";

export interface PendingActionBannerProps {
    variant?: PendingActionBannerVariant;
    style?: React.CSSProperties;
    className?: string;
}

export function PendingActionBanner({
    variant = "full",
    style,
    className,
}: PendingActionBannerProps) {
    const pending = usePendingAction();
    const [, tick] = useReducer(x => x + 1, 0);

    useEffect(() => {
        if (!pending) return;
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [pending]);

    if (!pending) return null;

    const secsRemaining = Math.ceil(PendingActionStore.msRemaining() / 1000);
    const isMinimal = variant === "minimal";

    return (
        <div
            onClick={isMinimal ? () => PendingActionStore.cancel() : undefined}
            className={className}
            style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: isMinimal ? "8px 12px" : "10px 14px",
                borderRadius: 8,
                width: "100%",
                boxSizing: "border-box",
                border: "1.5px solid color-mix(in srgb, var(--red-400) 45%, transparent)",
                background: "color-mix(in srgb, var(--red-400) 15%, transparent)",
                flexShrink: 0,
                cursor: isMinimal ? "pointer" : "default",
                transition: isMinimal ? "filter 0.12s, box-shadow 0.12s" : undefined,
                userSelect: "none",
                ...style,
            }}
            onMouseEnter={isMinimal ? e => {
                e.currentTarget.style.filter = "brightness(1.14)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.22)";
            } : undefined}
            onMouseLeave={isMinimal ? e => {
                e.currentTarget.style.filter = "";
                e.currentTarget.style.boxShadow = "";
            } : undefined}
        >
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-default)", lineHeight: 1.3 }}>
                    You have a pending action for "{pending.title}".
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, lineHeight: 1.5 }}>
                    {`It will run automatically in ${secsRemaining}s. `}
                    {isMinimal
                        ? <strong style={{ color: "var(--text-default)" }}>Click anywhere on this message to cancel it.</strong>
                        : "Use the button on the right to cancel it."
                    }
                </div>
            </div>

            {!isMinimal && (
                <Button
                    variant="dangerPrimary"
                    size="small"
                    onClick={() => PendingActionStore.cancel()}
                    style={{ flexShrink: 0 }}
                >
                    Cancel now
                </Button>
            )}
        </div>
    );
}
