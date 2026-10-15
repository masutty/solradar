/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { runTourAction } from "../../../stores/TourStore";
import { Btn, Legend, Muted, P, Row, SetUpDot, Tint, Wavy } from "../copy";
import type { Tour } from "../types";

const editorClosed = ["editor:closed"];

export const makeEditorTour = (): Tour => ({
    id: "editor",
    version: 2,
    label: "Trigger editor",
    steps: [
        {
            id: "editor.intro",
            kind: "info",
            endOn: editorClosed,
            title: "The trigger editor",
            body: <>
                <P>This is where a trigger is built. <b>Nothing is saved</b> until you say so.</P>
                <Muted>Already know your way around? Hit <b>Skip tutorial</b>. The <b>?</b> button at the top brings this back anytime.</Muted>
            </>,
        },
        {
            id: "editor.type",
            kind: "info",
            anchor: "editor.type",
            holeClickable: true,
            endOn: editorClosed,
            title: "What it watches",
            body: <>
                <P>Pick the kind of event.</P>
                <P>It sets the trigger's color and which options make sense.</P>
            </>,
        },
        {
            id: "editor.name",
            kind: "info",
            anchor: "editor.name",
            holeClickable: true,
            endOn: editorClosed,
            title: "Name it",
            body: <>
                <P>Give it a name you'll recognize in the list.</P>
                <Muted>You can't save it without one.</Muted>
            </>,
        },
        {
            id: "editor.actions",
            kind: "info",
            anchor: "editor.actions",
            holeClickable: true,
            endOn: editorClosed,
            title: "What it does",
            body: <Legend>
                <Row el={<Tint color="var(--status-positive)">Enabled</Tint>}>The trigger runs. <b>Nothing below works without it.</b></Row>
                <Row el={<Tint color="var(--text-brand)">Auto-join</Tint>}>Joins the server on a match.</Row>
                <Row el={<Tint color="var(--text-brand)">Notify</Tint>}>Shows a desktop notification.</Row>
            </Legend>,
        },
        {
            id: "editor.when",
            kind: "info",
            anchor: ["editor.keywords", "editor.preview"],
            holeClickable: true,
            endOn: editorClosed,
            title: "When it fires",
            body: <>
                <P>Add the words people type for this biome, <Wavy>tpyos</Wavy> included.</P>
                <P>The preview shows which sample messages would match.</P>
            </>,
        },
        {
            id: "editor.roles",
            kind: "info",
            anchor: "editor.roles",
            holeClickable: true,
            endOn: editorClosed,
            title: "Role pings",
            body: <>
                <P>Some servers only <b>ping a role</b> for a biome, with no text at all.</P>
                <P>For those, add the role here instead of words.</P>
                <Muted>A trigger needs at least one word or one role.</Muted>
            </>,
        },
        {
            id: "editor.extras",
            kind: "demo",
            anchor: "editor.optionalNav",
            placement: "bottom",
            enter: () => { runTourAction("editor.showSection", "lock"); },
            leave: () => { runTourAction("editor.showSection", "essentials"); },
            endOn: editorClosed,
            title: "Extras",
            body: <>
                <P>Optional sections: join lock, biome check, forwarding and filters.</P>
                <P>A <SetUpDot /> means that section is set up.</P>
            </>,
        },
        {
            id: "editor.biome",
            kind: "demo",
            // Every type but Merchant can have a biome to confirm
            when: () => Boolean(runTourAction<boolean>("editor.hasBiomeCheck")),
            anchor: "editor.biome",
            holeClickable: true,
            enter: () => { runTourAction("editor.showSection", "biome"); },
            leave: () => { runTourAction("editor.showSection", "essentials"); },
            endOn: editorClosed,
            title: "Biome check",
            body: <>
                <P>This trigger can watch a biome, so <b>set it up here too</b>. After a join, SolRadar reads your Roblox logs to confirm the biome is real.</P>
                <P><b>Biome name in the logs</b> is the name Roblox shows in its debug console. Press <code>F9</code> in game to see it.</P>
                <Muted>Biome detection itself is turned on in <b>Vencord settings → Plugins → SolRadar</b>.</Muted>
            </>,
        },
        {
            id: "editor.create",
            kind: "info",
            anchor: "editor.save",
            placement: "top",
            holeClickable: true,
            // Saving or cancelling here finishes the tour, it doesn't abandon it
            waitFor: "editor:closed",
            title: "Save or walk away",
            body: <Legend>
                <Row el={<Btn kind="positive">Create</Btn>}>Saves your trigger. It says <b>Save</b> when you edit one.</Row>
                <Row el={<Btn kind="secondary">Cancel</Btn>}>Throws your changes away.</Row>
            </Legend>,
        },
    ],
});
