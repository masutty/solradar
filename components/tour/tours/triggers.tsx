/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { runTourAction } from "../../../stores/TourStore";
import { getTriggers } from "../../../stores/TriggerStore";
import defaultTriggers from "../../../triggers.json";
import { setForcedHover } from "../anchors";
import { Btn, DisabledTag, Legend, Muted, P, PauseMark, Priority, QuickToggle, Rainbow, Row } from "../copy";
import type { Tour } from "../types";

const hasTriggers = () => getTriggers().length > 0;
const onScreen = (id: string) => !!document.querySelector(`[data-sora-tour="${id}"]`);
const folderOnScreen = () => onScreen("triggers.firstFolder");

// The card steps may open a closed folder first, so the card shows up a frame later. Hover it again then.
function hoverCard(id: string, on: boolean) {
    setForcedHover(id, on);
    if (on) setTimeout(() => setForcedHover(id, true), 120);
}
const MENU_ITEM = "#vc-sora-triggers-more-vc-sora-triggers-import-defaults";
const MENU_ROOT = "[role='menu'][aria-label='Trigger options']";
const openMenu = () => { runTourAction("triggers.openMoreMenu"); };
const closeMenu = () => { runTourAction("triggers.closeMoreMenu"); };

export const makeTriggersTour = (): Tour => ({
    id: "triggers",
    version: 3,
    label: "Triggers",
    groups: {
        // Card steps need a card on screen: open a folder for them if every card sits in a closed one
        cards: {
            enter: () => { runTourAction("triggers.revealCard"); },
            leave: () => { runTourAction("triggers.unrevealCard"); },
        },
    },
    steps: [
        {
            id: "triggers.intro",
            kind: "info",
            title: "Welcome to Triggers",
            body: <>
                <P>A trigger is a rule. It says <b>which messages count</b> and <b>what SolRadar does</b> when one shows up.</P>
                <Muted>Already know your way around? Hit <b>Skip tutorial</b>. The <b>?</b> button at the top brings this back anytime.</Muted>
            </>,
        },
        {
            id: "triggers.defaults",
            kind: "demo",
            when: () => !hasTriggers(),
            anchor: { css: MENU_ITEM, fallback: "triggers.more" },
            placement: "left",
            holeClickable: true,
            enter: openMenu,
            leave: closeMenu,
            waitFor: "triggers:imported",
            secondaryLabel: "Not now",
            primary: { label: "Import them", run: () => runTourAction<Promise<void>>("triggers.importDefaults") },
            title: "Start with the defaults",
            body: <>
                <P>You don't have any triggers yet.</P>
                <P>The defaults cover <Rainbow>rare biomes</Rainbow>, events and merchants: <b>{defaultTriggers.length} triggers</b>, all off until you pick the ones you want.</P>
            </>,
        },
        {
            id: "triggers.cards",
            kind: "demo",
            when: hasTriggers,
            group: "cards",
            anchor: "triggers.firstCard",
            enter: () => hoverCard("triggers.firstCard", true),
            leave: () => hoverCard("triggers.firstCard", false),
            title: "Your triggers",
            body: <>
                <P>Each card is one trigger. <b>Click</b> it to edit it.</P>
                <P>Hover it for quick toggles:</P>
                <Legend>
                    <Row el={<QuickToggle emoji="🎯" color="var(--green-360)" />}>Auto-join</Row>
                    <Row el={<QuickToggle emoji="🔔" color="var(--blue-345)" />}>Notify</Row>
                    <Row el={<QuickToggle emoji="➡️" color="var(--blue-345)" />}>Forward to a webhook</Row>
                </Legend>
            </>,
        },
        {
            id: "triggers.power",
            kind: "demo",
            when: hasTriggers,
            group: "cards",
            anchor: "triggers.firstIcon",
            placement: "right",
            enter: () => hoverCard("triggers.firstIcon", true),
            leave: () => hoverCard("triggers.firstIcon", false),
            title: "Turn it on or off",
            body: <>
                <P>Click a trigger's <b>icon</b> to switch it on or off, right from the list.</P>
                <P>Triggers that are off look greyed out and get a <DisabledTag /> tag.</P>
            </>,
        },
        {
            id: "triggers.priority",
            kind: "info",
            when: hasTriggers,
            group: "cards",
            anchor: "triggers.firstPriority",
            placement: "left",
            title: "Priority",
            body: <Legend>
                <Row el={<Priority value={1} />}><b>Lower number wins</b> when two triggers match.</Row>
                <Row el={<Priority value={1} lock />}><b>Join lock</b>: after a join, triggers with a higher number are ignored for a while.</Row>
            </Legend>,
        },
        {
            id: "triggers.folders",
            kind: "demo",
            when: folderOnScreen,
            anchor: "triggers.firstFolder",
            enter: () => setForcedHover("triggers.firstFolder", true),
            leave: () => setForcedHover("triggers.firstFolder", false),
            title: "Folders",
            body: <>
                <P>Folders group your triggers. <b>Drag</b> a card onto one, or right-click it and pick <b>Move to folder</b>.</P>
                <P>Hover a folder to see how many of its triggers are on, or click the pencil to edit it.</P>
            </>,
        },
        {
            id: "triggers.folderPause",
            kind: "demo",
            when: folderOnScreen,
            anchor: "triggers.folderPause",
            placement: "left",
            enter: () => setForcedHover("triggers.firstFolder", true),
            leave: () => setForcedHover("triggers.firstFolder", false),
            title: "Pause a folder",
            body: <>
                <P>This button pauses the whole folder: <b>none of its triggers run</b> until you turn it back on.</P>
                <P>Each trigger keeps its own on or off, so they come back as they were. A paused folder looks faded and keeps a <PauseMark /> mark.</P>
            </>,
        },
        {
            id: "triggers.menu",
            kind: "demo",
            when: ctx => hasTriggers() && !ctx.ran("triggers.defaults"),
            anchor: { css: MENU_ROOT, fallback: "triggers.more" },
            placement: "left",
            enter: openMenu,
            leave: closeMenu,
            title: "Folders, import and export",
            body: <>
                <P><b>New folder</b> groups triggers you want to keep together.</P>
                <P><b>Import</b> brings back the defaults or loads triggers from a file.</P>
                <P><b>Export</b> saves yours to a file, as a backup or to share.</P>
            </>,
        },
        {
            id: "triggers.new",
            kind: "info",
            anchor: "triggers.new",
            holeClickable: true,
            // Opening the editor ends this tour as done, and the editor starts its own
            waitFor: "editor:opened",
            title: "Make your own",
            body: <>
                <P><Btn kind="positive">+ New</Btn> opens the editor, with its own short tour the first time.</P>
                <Muted>Happy with the defaults? You're all set.</Muted>
            </>,
        },
    ],
});
