/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { PluginNative } from "@utils/types";
import { React, RunningGameStore, showToast, TextInput, Tooltip } from "@webpack/common";

import { Logger } from "../../../logger";
import { getRobloxProcess, joinUri, prepareAdb, rejoinUntilBiome, RejoinUntilBiomeHandle } from "../../../services/RobloxService";
import { settings } from "../../../settings";
import { JoinLockStore } from "../../../stores/JoinLockStore";
import { SnipeStore } from "../../../stores/SnipeStore";
import { checkForUpdates, isDeveloper } from "../../../utils";
import { EditableActionButton } from "../../ui/EditableActionButton";
import { Note } from "../../ui/Note";
import { Pill } from "../../ui/Pill";
import { card, COLORS, descriptionText, labelText, rowCard, sectionTitle, tabColumn } from "../../ui/styles";
import { Block } from "../settings/Block";

const logger = new Logger("SolRadar.Developer");

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;

// --- Pieces ---

const wrapRow: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };

/** A debug call: function name on the left, a Run button on the right. */
function DebugRow({ name, hint, onRun }: { name: string; hint: string; onRun: () => unknown; }) {
    return (
        <div style={rowCard}>
            <Tooltip text={hint}>
                {props => (
                    <span {...props} style={{ ...labelText, fontFamily: "var(--font-code)", fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                    </span>
                )}
            </Tooltip>
            <Button size="small" variant="secondary" onClick={() => onRun()}>Run</Button>
        </div>
    );
}

// TODO: flaky, don't use.
// Closing the plugin modal breaks it and it rejoins forever. The running state and the biome
// target should be saved somewhere. Sniping while it runs also kicks you out of your snipes.
function BiomeFarmer() {
    const [biomeTarget, setBiomeTarget] = React.useState("glitch");
    const [handle, setHandle] = React.useState<RejoinUntilBiomeHandle | null>(null);
    const isAutoRejoining = handle !== null;

    async function toggle() {
        if (isAutoRejoining) {
            handle.cancel();
            setHandle(null);
        } else {
            const h = await rejoinUntilBiome(biomeTarget, () => setHandle(null));
            setHandle(h);
        }
    }

    return (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={labelText}>Rejoin until biome</span>
                <span style={descriptionText}>Keeps rejoining until the target biome shows up.</span>
            </div>
            <Note variant="warning">Flaky: closing this window can leave it rejoining forever, and sniping while it runs kicks you out.</Note>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <TextInput
                    style={{ flex: 1 }}
                    value={biomeTarget}
                    onChange={setBiomeTarget}
                    placeholder="Biome name"
                    disabled={isAutoRejoining}
                />
                <Button
                    size="small"
                    variant={isAutoRejoining ? "dangerPrimary" : "primary"}
                    onClick={toggle}
                    disabled={!biomeTarget.trim()}
                >
                    {isAutoRejoining ? "Stop" : "Start"}
                </Button>
            </div>
        </div>
    );
}

// --- DeveloperTab ---

export function DeveloperTab() {
    const [open, setOpen] = React.useState<Record<string, boolean>>({});
    const toggle = (id: string) => setOpen(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div style={tabColumn}>
            <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 16, textAlign: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.text }}>You're not supposed to be here!!</span>
                <span style={descriptionText}>This is a tab just for testing stuff.</span>
                <span style={{ fontSize: 18, marginTop: 4 }}>👉🔴🔵👈🤞🤌🫴🟣</span>
            </div>

            <p style={sectionTitle}>Roblox</p>
            <div style={{ ...card, ...wrapRow }}>
                <EditableActionButton
                    id="dev_openUri_one"
                    defaultLabel="openUri()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    onAction={data => joinUri(data)}
                />
                <EditableActionButton
                    id="dev_openUri_two"
                    defaultLabel="openUri()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    onAction={data => joinUri(data)}
                />
                <EditableActionButton
                    id="dev_prepareAdb"
                    defaultLabel="prepareAdb()"
                    defaultValue="roblox://experiences/start?placeId=15532962292"
                    placeholder="roblox://experiences/start?placeId=..."
                    onAction={data => prepareAdb(data)}
                />
                <Button
                    size="small"
                    variant="dangerPrimary"
                    onClick={() => Native.closeRobloxOnEmulator(settings.store.ldpAdbPath, settings.store.ldpAdbDeviceSerial, settings.store.ldpAdbPackageName)}
                >
                    Kill emulator
                </Button>
            </div>
            <span style={{ ...descriptionText, padding: "0 4px" }}>Right-click a function button to edit its label and value.</span>
            <BiomeFarmer />

            <p style={sectionTitle}>Debug</p>
            <DebugRow name="getRobloxProcess()" hint="Logs the Roblox process from RunningGameStore" onRun={() => logger.debug(getRobloxProcess())} />
            <DebugRow name="RunningGameStore.getRunningGames()" hint="Logs every game Discord sees running" onRun={() => logger.debug(RunningGameStore.getRunningGames())} />
            <DebugRow name={'JoinLockStore.activate(10, 30, "fakeLock")'} hint="Sets a fake 30s join lock at priority 10" onRun={() => JoinLockStore.activate(10, 30, "fakeLock")} />
            <DebugRow name="SnipeStore.addFakes(1)" hint="Adds one fake snipe to the history" onRun={() => SnipeStore.addFakes(1)} />
            <DebugRow name="isDeveloper()" hint="Logs whether you count as a developer" onRun={() => logger.debug(isDeveloper())} />
            <DebugRow
                name="checkForUpdates()"
                hint="Runs the update check now"
                onRun={async () => showToast(await checkForUpdates() ? "Update check done" : "Update check failed", "message")}
            />

            <p style={sectionTitle}>Showcase</p>
            <Block title="Buttons" subtitle="Every size and variant" open={!!open.buttons} onToggle={() => toggle("buttons")}>
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={wrapRow}>
                        <Button size="xs">size: xs</Button>
                        <Button size="small">size: small</Button>
                        <Button size="medium">size: medium</Button>
                        <Button size="min">size: min</Button>
                    </div>
                    <div style={wrapRow}>
                        <Button variant="dangerPrimary" size="small">dangerPrimary</Button>
                        <Button variant="dangerSecondary" size="small">dangerSecondary</Button>
                        <Button variant="link" size="small">link</Button>
                        <Button variant="none" size="small">none</Button>
                        <Button variant="overlayPrimary" size="small">overlayPrimary</Button>
                        <Button variant="positive" size="small">positive</Button>
                        <Button variant="primary" size="small">primary</Button>
                        <Button variant="secondary" size="small">secondary</Button>
                    </div>
                </div>
            </Block>

            <Block title="Cards" subtitle="Vencord's Card variants" open={!!open.cards} onToggle={() => toggle("cards")}>
                <div style={{ ...card, ...wrapRow }}>
                    <Card variant="danger" defaultPadding><span>Danger Card</span></Card>
                    <Card variant="normal" defaultPadding><span>Normal Card</span></Card>
                    <Card variant="warning" defaultPadding><span>Warning Card</span></Card>
                </div>
            </Block>

            <Block title="Pills" subtitle="Sizes, radius, borders and variants" open={!!open.pills} onToggle={() => toggle("pills")}>
                <div style={{ ...card, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={wrapRow}>
                        <Pill size="xs" variant="brand">size: xs</Pill>
                        <Pill size="small" variant="brand">size: small</Pill>
                        <Pill variant="brand">size: default</Pill>
                    </div>
                    <div style={wrapRow}>
                        <Pill radius="none" variant="blue">radius: none</Pill>
                        <Pill radius="xs" variant="blue">radius: xs</Pill>
                        <Pill radius="md" variant="blue">radius: md</Pill>
                        <Pill variant="blue">radius: default</Pill>
                    </div>
                    <div style={wrapRow}>
                        <Pill border="subtle" variant="purple">border: subtle</Pill>
                        <Pill border="strong" variant="purple">border: strong</Pill>
                        <Pill variant="purple">border: none</Pill>
                    </div>
                    <div style={wrapRow}>
                        <Pill variant="brand">brand</Pill>
                        <Pill variant="green">green</Pill>
                        <Pill variant="red">red</Pill>
                        <Pill variant="yellow">yellow</Pill>
                        <Pill variant="pink">pink</Pill>
                        <Pill variant="purple">purple</Pill>
                        <Pill variant="muted">muted</Pill>
                    </div>
                    <div style={wrapRow}>
                        <Pill iconOnly emoji="🔥" variant="red" title="fire" />
                        <Pill iconOnly emoji="✨" variant="yellow" title="sparkle" />
                        <Pill iconOnly emoji="🟢" variant="green" title="status" />
                    </div>
                    {/* Long content, to see how pills wrap */}
                    <div style={wrapRow}>
                        <Pill variant="brand">
                            Lorem ipsum dolor sit, amet consectetur adipisicing elit. Fugit, explicabo, laudantium numquam, assumenda ratione amet tempore eveniet incidunt unde dolorum dolores delectus cupiditate optio impedit reiciendis beatae distinctio illo eos?
                        </Pill>
                        <Pill size="xs" variant="muted">
                            Lorem ipsum dolor sit, amet consectetur adipisicing elit. Fugit, explicabo, laudantium numquam, assumenda ratione amet tempore eveniet incidunt unde dolorum dolores delectus cupiditate optio impedit reiciendis beatae distinctio illo eos?
                        </Pill>
                    </div>
                </div>
            </Block>
        </div>
    );
}
