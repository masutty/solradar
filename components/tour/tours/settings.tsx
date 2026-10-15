/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { runTourAction } from "../../../stores/TourStore";
import { COLORS } from "../../ui/styles";
import { Btn, Legend, Muted, P, QuickToggle, Rainbow, Row, Tint } from "../copy";
import type { Tour } from "../types";

// Set by "Skip this part", read by the verification steps
let skipVerification = false;

const reveal = (block: string) => () => { runTourAction("settings.reveal", block); };
const showVerification = () => !skipVerification;

export const makeSettingsTour = (): Tour => ({
    id: "settings",
    version: 2,
    label: "Settings",
    steps: [
        {
            id: "settings.intro",
            kind: "info",
            enter: () => { skipVerification = false; },
            title: "Settings",
            body: <>
                <P>Most of this you set once and forget.</P>
                <P>This tour covers the parts that decide <b>what happens when a trigger fires</b>.</P>
                <Muted>Already know your way around? Hit <b>Skip tutorial</b>. The <b>?</b> button at the top brings this back anytime.</Muted>
            </>,
        },
        {
            id: "settings.overview",
            kind: "info",
            anchor: "settings.overview",
            enter: reveal("overview"),
            title: "At a glance",
            body: <>
                <P>The top shows what's on, and warns you when something is off.</P>
                <P><Btn kind="secondary">Fix</Btn> jumps straight to the setting that needs it.</P>
            </>,
        },
        {
            id: "settings.switches",
            kind: "info",
            anchor: "settings.switches",
            title: "The two master switches",
            body: <>
                <Legend>
                    <Row el={<Tint color={COLORS.positive}>Auto-join</Tint>}>Joins the server when a trigger matches.</Row>
                    <Row el={<Tint color={COLORS.positive}>Notifications</Tint>}>Shows a desktop alert on a match.</Row>
                </Legend>
                <P>They switch the feature for <b>every trigger</b>. While one is off, a trigger's own <QuickToggle emoji="🎯" color="var(--green-360)" /> or <QuickToggle emoji="🔔" color="var(--blue-345)" /> does nothing.</P>
            </>,
        },
        {
            id: "settings.biome",
            kind: "demo",
            anchor: "settings.block.biome",
            placement: "left",
            enter: reveal("biome"),
            title: "Biome actions",
            body: <>
                <P>After a join, SolRadar can read your Roblox logs to check the biome. Pick what happens when it:</P>
                <Legend>
                    <Row el={<Tint color={COLORS.danger}>Is fake</Tint>}>The biome doesn't match the announcement.</Row>
                    <Row el={<Tint color={COLORS.muted}>Ends</Tint>}>A real biome is over.</Row>
                    <Row el={<Tint color={COLORS.warning}>Times out</Tint>}>The biome wasn't confirmed in time. <b>Waiting in a server queue counts too</b>: wait too long and this action runs.</Row>
                </Legend>
                <Muted>For example: close Roblox, or join a public server or your private one.</Muted>
                <Muted>Biome detection itself is turned on in <b>Vencord settings → Plugins → SolRadar</b>, and needs a Discord restart.</Muted>
            </>,
        },
        {
            id: "settings.ignored",
            kind: "demo",
            anchor: { css: "[data-sora-setting='ignoredGuilds']", fallback: "settings.block.monitoring" },
            placement: "left",
            enter: reveal("monitoring"),
            title: "Servers that ban snipers",
            body: <>
                <P>Some servers <Tint color={COLORS.danger}>don't allow macros or auto-joins</Tint>.</P>
                <P>Add them to <Tint color="var(--text-brand)">Always ignore these servers</Tint> and SolRadar never snipes from them.</P>
                <P><Rainbow>You can still snipe there, but if you get punished, that's on you {"¯\\_(ツ)_/¯"}</Rainbow></P>
            </>,
        },
        {
            id: "settings.verification",
            kind: "demo",
            anchor: "settings.block.verification",
            placement: "left",
            enter: reveal("verification"),
            secondaryLabel: "Skip this part",
            secondaryRun: () => { skipVerification = true; },
            primary: { label: "Show me", run: () => { } },
            title: "Link verification",
            body: <>
                <P>Checks that a server link is real before you trust it.</P>
                <P>It needs your <b>Roblox cookie</b>, so it's <Tint color={COLORS.positive}>completely optional</Tint>. SolRadar works fine without it.</P>
            </>,
        },
        {
            id: "settings.verification.mode",
            kind: "demo",
            when: showVerification,
            anchor: "settings.block.verification",
            placement: "left",
            enter: reveal("verification"),
            title: "Before or after",
            body: <>
                <Legend>
                    <Row el={<b>Before joining</b>}>Slower, but never opens a bad link.</Row>
                    <Row el={<b>After joining</b>}>Faster. If the link turns out bad, runs the action you pick below.</Row>
                </Legend>
            </>,
        },
        {
            id: "settings.verification.cookie",
            kind: "info",
            when: showVerification,
            title: "Where the cookie goes",
            body: <>
                <P>If you decide to use it, your <code>.ROBLOSECURITY</code> cookie goes in <b>Vencord settings → Plugins → SolRadar → Roblox Token</b>.</P>
                <P><Tint color={COLORS.danger}>Treat it like a password.</Tint> Never share it, and use an alt account if you can.</P>
                <Muted>SolRadar only sends it to Roblox, to check links.</Muted>
            </>,
        },
    ],
});
