/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, showToast } from "@webpack/common";

import { AutoPlayStore, useAutoPlayState } from "../../services/AutoPlayState";
import { emulatorAutoPlay, stopAutoPlay } from "../../services/EmulatorAutoPlay";
import { forceKillAutomation } from "../../services/InputAutomation";
import { stopWindowsAutoPlay, windowsAutoPlay } from "../../services/WindowsAutoPlay";
import { Pill, PillVariant } from "./Pill";
import { descriptionText, labelText, rowCard } from "./styles";

const STATUS: Record<"idle" | "waiting" | "tapping", { variant: PillVariant; label: string; }> = {
    idle: { variant: "muted", label: "Idle" },
    waiting: { variant: "yellow", label: "Waiting" },
    tapping: { variant: "green", label: "Clicking" },
};

function AutoPlayRow({ title, store, onStop }: { title: string; store: AutoPlayStore; onStop: (reason: string) => void; }) {
    const { status, taps, lastTapAt, note, endedBecause } = useAutoPlayState(store);

    const detail = status === "idle"
        ? endedBecause ? `Last run ended: ${endedBecause} (${taps} clicks)` : "Has not run yet"
        : [note, taps > 0 && `${taps} clicks, last at ${new Date(lastTapAt!).toLocaleTimeString()}`].filter(Boolean).join(" · ");

    return (
        <div style={rowCard}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ ...labelText, display: "flex", alignItems: "center", gap: 8 }}>
                    {title} <Pill variant={STATUS[status].variant} size="small">{STATUS[status].label}</Pill>
                </span>
                <span style={descriptionText}>{detail}</span>
            </div>
            <Button size="small" variant="secondary" disabled={status === "idle"} onClick={() => onStop("stopped by you")}>
                Stop
            </Button>
        </div>
    );
}

/** Live state of the Play clicking on the emulator and on this PC, with a force kill for when it goes wrong. */
export function AutoPlayControls() {
    const forceKill = async () => {
        const res = await forceKillAutomation();
        showToast(res.ok
            ? { text: "All automatic clicking force killed", variant: "success" }
            : { text: `Couldn't force kill: ${res.error}`, variant: "critical" });
    };

    return (
        <>
            <AutoPlayRow title="Emulator taps" store={emulatorAutoPlay} onStop={stopAutoPlay} />
            <AutoPlayRow title="Windows clicks" store={windowsAutoPlay} onStop={stopWindowsAutoPlay} />
            <div style={rowCard}>
                <span style={descriptionText}>Stops every click, the capture, the input helper and every adb.exe.</span>
                <Button size="small" variant="dangerPrimary" onClick={forceKill}>Force kill everything</Button>
            </div>
        </>
    );
}
