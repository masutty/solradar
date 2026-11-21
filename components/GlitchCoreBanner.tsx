/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, useReducer } from "@webpack/common";

import { settings } from "../settings";
import { GlitchCorePauseStore, useGlitchCorePause } from "../stores/GlitchCorePauseStore";
import { runTourAction } from "../stores/TourStore";
import { TimerIcon, WarningIcon } from "./icons/BannerIcons";
import { DrainBanner } from "./ui/DrainBanner";

export interface GlitchCoreBannerProps {
    style?: React.CSSProperties;
    className?: string;
}

function formatClock(totalSeconds: number): string {
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function GlitchCoreBanner({ style, className }: GlitchCoreBannerProps) {
    const pause = useGlitchCorePause();
    const { glitchCoreBypassClickLimits } = settings.use(["glitchCoreBypassClickLimits"]);
    const [, tick] = useReducer(x => x + 1, 0);

    React.useEffect(() => {
        if (!pause) return;
        const id = setInterval(tick, 250);
        return () => clearInterval(id);
    }, [pause]);

    if (glitchCoreBypassClickLimits) {
        return (
            <DrainBanner
                accent="var(--red-400)"
                icon={<WarningIcon size={21} />}
                title="Glitch Core click limits are off"
                subtitle="Not recommended"
                time="Always"
                action="Open setting"
                tooltip={"Glitch Core buttons are clicked with no limits.\nClick anywhere to open the setting."}
                fraction={1}
                openEnded
                onClick={() => runTourAction("modal.openSetting", "other", "glitchCoreBypassClickLimits")}
                style={style}
                className={className}
            />
        );
    }

    if (!pause) return null;

    const msLeft = GlitchCorePauseStore.msRemaining();

    return (
        <DrainBanner
            accent="var(--yellow-300)"
            icon={<TimerIcon size={21} />}
            title="Glitch Core clicks paused"
            subtitle={pause.cause}
            time={formatClock(Math.ceil(msLeft / 1000))}
            action="Resume"
            tooltip={`Paused because ${pause.cause}.\nClick anywhere to resume now.`}
            fraction={msLeft / pause.durationMs}
            onClick={() => GlitchCorePauseStore.resume()}
            style={style}
            className={className}
        />
    );
}
