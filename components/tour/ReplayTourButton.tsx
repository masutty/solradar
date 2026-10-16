/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ReactDOM, Tooltip, useEffect, useRef, useState } from "@webpack/common";

import { TourStore, useTourState } from "../../stores/TourStore";
import { getTour } from "./tours";

const HINT_MS = 3300;

export function ReplayTourButton({ tourId }: { tourId: string; }) {
    const tour = getTour(tourId);
    const { endedAt, endedTour } = useTourState();
    const seenEndedAt = useRef(endedAt);
    const [hint, setHint] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    // Pulse only for tours that end while this window is open
    useEffect(() => {
        if (endedAt === seenEndedAt.current) return;
        seenEndedAt.current = endedAt;
        if (endedTour !== tourId) return;
        setHint(true);
        const timer = setTimeout(() => setHint(false), HINT_MS);
        return () => clearTimeout(timer);
    }, [endedAt]);

    if (!tour) return null;
    const label = `Replay the ${tour.label} tour`;
    // Portaled and fixed, because modal headers clip what overflows them
    const at = hint ? boxRef.current?.getBoundingClientRect() : undefined;

    return (
        <div ref={boxRef} className={`vc-sora-tour-replay${hint ? " hint" : ""}`}>
            <Tooltip text={label}>
                {props => (
                    <button
                        {...props}
                        type="button"
                        aria-label={label}
                        className="vc-sora-tour-replay-btn"
                        onClick={() => {
                            setHint(false);
                            TourStore.start(tour);
                        }}
                    >
                        <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M8.5 8.5a3.5 3.5 0 1 1 5 3.16c-.9.42-1.5 1.3-1.5 2.3V15" />
                            <path d="M12 19.2v.1" />
                        </svg>
                    </button>
                )}
            </Tooltip>
            {at && ReactDOM.createPortal(
                <span className="vc-sora-tour-replay-hint" style={{ top: at.bottom + 8, right: window.innerWidth - at.right - 6 }}>
                    Replay anytime from here
                </span>,
                document.body
            )}
        </div>
    );
}

/**
 * The ? and close buttons for a modal header. The close button is ours, not Discord's ModalCloseButton:
 * themes move Discord's one on their own, and then it lands on top of the ?.
 */
export function HeaderActions({ tourId, onClose }: { tourId: string; onClose: () => void; }) {
    return (
        <div className="vc-sora-header-actions">
            <ReplayTourButton tourId={tourId} />
            <button type="button" aria-label="Close" className="vc-sora-tour-replay-btn" onClick={onClose}>
                <svg viewBox="0 0 24 24" width={24} height={24} fill="currentColor" aria-hidden="true">
                    <path d="M17.3 18.7a1 1 0 0 0 1.4-1.4L13.42 12l5.3-5.3a1 1 0 0 0-1.42-1.4L12 10.58l-5.3-5.3a1 1 0 0 0-1.4 1.42L10.58 12l-5.3 5.3a1 1 0 1 0 1.42 1.4L12 13.42l5.3 5.3Z" />
                </svg>
            </button>
        </div>
    );
}
