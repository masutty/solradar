/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { SnipeEntry, SnipeStore } from "../../../stores/SnipeStore";
import { runTourAction } from "../../../stores/TourStore";
import { getSnipeStatus } from "../../tabs/recentJoins/components";
import { phaseSpans } from "../../tabs/recentJoins/steps";
import { closeModal } from "../../ui/LegacyModal";
import { COLORS } from "../../ui/styles";
import { Legend, Muted, P, ResultBadge, Row, StatusPill } from "../copy";
import type { Tour } from "../types";

const hasSnipes = () => SnipeStore.all.length > 0;
const demoSnipe = () => runTourAction<SnipeEntry>("history.demoSnipe");
const demoIsBiome = () => Boolean(demoSnipe()?.tags.some(t => t.startsWith("biome-")));
const demoHasTimings = () => {
    const entry = demoSnipe();
    return Boolean(entry && phaseSpans(entry).length);
};

// The details modal belongs to the tour while its steps run
let detailsKey: string | undefined;

/** The status pill of the snipe the tour opened, read when the step shows. */
function DemoStatus() {
    const entry = demoSnipe();
    if (!entry) return null;
    const { label, color } = getSnipeStatus(entry);
    return <StatusPill label={label} color={color} />;
}

export const makeRecentJoinsTour = (): Tour => ({
    id: "recentJoins",
    version: 2,
    label: "Snipe History",
    groups: {
        details: {
            enter: () => { detailsKey = runTourAction<string>("history.openDemoSnipe"); },
            leave: () => {
                if (detailsKey) closeModal(detailsKey);
                detailsKey = undefined;
            },
        },
    },
    steps: [
        {
            id: "history.intro",
            kind: "info",
            title: "Snipe History",
            body: <>
                <P>Every message that matched one of your triggers lands here, with <b>everything that happened after</b>.</P>
                <Muted>Already know your way around? Hit <b>Skip tutorial</b>. The <b>?</b> button at the top brings this back anytime.</Muted>
            </>,
        },
        {
            id: "history.card",
            kind: "info",
            when: hasSnipes,
            anchor: "history.firstCard",
            title: "Read a snipe",
            body: <>
                <P>The badge on the icon says how it ended:</P>
                <Legend>
                    <Row el={<ResultBadge icon="ok" color={COLORS.positive} />}>Real biome</Row>
                    <Row el={<ResultBadge icon="bad" color={COLORS.danger} />}>Bait, unsafe link or failed join</Row>
                    <Row el={<ResultBadge icon="wait" color={COLORS.warning} />}>Timed out</Row>
                </Legend>
                <P>On the right, <b>⚡</b> is how fast you reacted and <b>🌿</b> is how long a real biome lasted.</P>
                <Muted><b>Click</b> a snipe to open it. <b>Right-click</b> it for quick actions.</Muted>
            </>,
        },
        {
            id: "history.details",
            kind: "demo",
            group: "details",
            when: hasSnipes,
            anchor: "details.header",
            title: "Inside a snipe",
            body: <>
                <P>We opened one for you.</P>
                <P>Up top: the trigger that caught it, when it happened, and how it ended, like <DemoStatus />.</P>
            </>,
        },
        {
            id: "history.verdict",
            kind: "info",
            group: "details",
            when: () => hasSnipes() && demoIsBiome(),
            anchor: "details.verdict",
            title: "Fix the verdict",
            body: <>
                <P>If biome detection got it wrong, change it here.</P>
                <Muted>Your stats use this answer.</Muted>
            </>,
        },
        {
            id: "history.timeline",
            kind: "demo",
            group: "details",
            when: () => hasSnipes() && demoHasTimings(),
            anchor: "details.timeline",
            enter: () => { runTourAction("details.setView", "waterfall"); },
            leave: () => { runTourAction("details.setView", "timeline"); },
            title: "Step by step",
            body: <>
                <P>Every step from the message to the join, with timings.</P>
                <P><b>Waterfall</b>, shown here, makes it easy to see where the time went.</P>
            </>,
        },
        {
            id: "history.actions",
            kind: "info",
            group: "details",
            when: hasSnipes,
            anchor: "details.footer",
            placement: "top",
            title: "Act on it",
            body: <P>Join again, copy the link or jump to the original message.</P>,
        },
        {
            id: "history.empty",
            kind: "info",
            when: () => !hasSnipes(),
            anchor: "history.empty",
            title: "Nothing here yet",
            body: <P>Turn on a trigger and your snipes show up here as they happen.</P>,
        },
    ],
});
