/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "../../ui/modal.css";

import { Button } from "@components/Button";
import { Heading } from "@components/Heading";
import { React, Tooltip } from "@webpack/common";

import { BOLT_PRESETS, BOLT_STEP_KEYS, DEFAULT_BOLT_STEPS, JOIN_STEPS, sameSteps, STEP_CATS } from "../../../services/JoinTimeline";
import { settings } from "../../../settings";
import { HeaderActions } from "../../tour/ReplayTourButton";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../ui/LegacyModal";
import { COLORS, descriptionText, labelText } from "../../ui/styles";

const tile = (on: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
    textAlign: "left", fontSize: 14, fontWeight: on ? 600 : 500,
    color: on ? COLORS.text : COLORS.label,
    background: on ? "var(--background-mod-strong)" : "var(--background-mod-subtle)",
    border: `1px solid ${on ? "var(--brand-500)" : "var(--background-mod-normal)"}`,
});

const tileGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 };
const groupTitle: React.CSSProperties = { ...descriptionText, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" };
const defaultBadge: React.CSSProperties = {
    marginLeft: "auto", flexShrink: 0, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.04em", color: COLORS.brand, background: "var(--background-mod-normal)",
};
// The first two presets are the ones worth picking. The rest are for digging into one part of a join
const RECOMMENDED = BOLT_PRESETS.slice(0, 2);
const OTHER_PRESETS = BOLT_PRESETS.slice(2);
const ellipsis: React.CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

function BoltModal({ modalProps }: { modalProps: ModalProps; }) {
    const { historyBoltSteps } = settings.use(["historyBoltSteps"]);
    const toggle = (key: string) => {
        settings.store.historyBoltSteps = historyBoltSteps.includes(key) ? historyBoltSteps.filter(k => k !== key) : [...historyBoltSteps, key];
    };

    const presetTile = (p: typeof BOLT_PRESETS[number]) => {
        const on = sameSteps(p.steps, historyBoltSteps);
        return (
            <Tooltip key={p.label} text={p.tip}>
                {props => (
                    <button {...props} type="button" aria-pressed={on} style={tile(on)} onClick={() => { settings.store.historyBoltSteps = [...p.steps]; }}>
                        <span style={ellipsis}>{p.label}</span>
                        {sameSteps(p.steps, DEFAULT_BOLT_STEPS) && <span style={defaultBadge}>Default</span>}
                    </button>
                )}
            </Tooltip>
        );
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader className="vc-sora-modal-header vc-sora-modal-header-tall">
                <Heading tag="h2" className="vc-sora-modal-title" style={{ margin: 0, flex: 1 }}>History timing number</Heading>
                <HeaderActions onClose={modalProps.onClose} />
            </ModalHeader>

            <ModalContent>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0 16px" }}>
                    <span style={{ ...descriptionText, fontSize: 14 }}>The steps you pick are added up into one number on every snipe in History. Pick a preset or build your own. Pick none to hide the ⚡. A step a join didn't have counts as 0.</span>

                    <span style={{ ...groupTitle, marginTop: 6 }}>Recommended</span>
                    <div style={tileGrid}>{RECOMMENDED.map(presetTile)}</div>

                    <span style={{ ...groupTitle, marginTop: 6 }}>Other presets</span>
                    <div style={tileGrid}>{OTHER_PRESETS.map(presetTile)}</div>

                    <span style={{ ...groupTitle, marginTop: 6 }}>Steps</span>
                    <div style={tileGrid}>
                        {BOLT_STEP_KEYS.map(key => {
                            const on = historyBoltSteps.includes(key);
                            return (
                                <Tooltip key={key} text={JOIN_STEPS[key].tip}>
                                    {props => (
                                        <button {...props} type="button" aria-pressed={on} style={tile(on)} onClick={() => toggle(key)}>
                                            <i style={{ width: 8, height: 8, borderRadius: "50%", background: STEP_CATS[JOIN_STEPS[key].cat].color, flexShrink: 0 }} />
                                            <span style={ellipsis}>{JOIN_STEPS[key].name}</span>
                                        </button>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </div>
                </div>
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                    <Button size="small" variant="primary" onClick={modalProps.onClose}>Done</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

/** The Settings row that opens the picker. */
export function BoltSetting() {
    const { historyBoltSteps } = settings.use(["historyBoltSteps"]);
    const preset = BOLT_PRESETS.find(p => sameSteps(p.steps, historyBoltSteps));
    const current = historyBoltSteps.length === 0
        ? "Hidden"
        : preset?.label ?? `${historyBoltSteps.length} ${historyBoltSteps.length === 1 ? "step" : "steps"} added up`;

    return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 14px", borderRadius: 8, background: "var(--background-mod-subtle)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={labelText}>History timing number</span>
                <span style={descriptionText}>What Snipe History shows beside the ⚡ on each snipe. Now: {current}.</span>
            </div>
            <Button size="small" variant="secondary" onClick={() => openModal(p => <BoltModal modalProps={p} />)}>Choose</Button>
        </div>
    );
}
