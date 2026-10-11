/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { GuildStore, React, TextInput } from "@webpack/common";

import { ActiveChannel, ActiveChannelStore } from "../../stores/ActiveChannelStore";
import { formatElapsedTime } from "../../utils";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../ui/LegacyModal";

// --- Types ---

interface GuildSummary {
    guildId: string;
    guildName: string;
    channels: ActiveChannel[];
}

// --- Helpers ---

function groupByGuild(channels: ActiveChannel[]): GuildSummary[] {
    const map = new Map<string, GuildSummary>();
    for (const ch of channels) {
        if (!map.has(ch.guildId))
            map.set(ch.guildId, { guildId: ch.guildId, guildName: ch.guildName, channels: [] });
        map.get(ch.guildId)!.channels.push(ch);
    }
    return [...map.values()].sort((a, b) => {
        const aLast = Math.max(...a.channels.map(c => c.lastMessageAt));
        const bLast = Math.max(...b.channels.map(c => c.lastMessageAt));
        return bLast - aLast;
    });
}

function guildIconUrl(guildId: string, iconHash: string): string {
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.webp?size=64`;
}

// --- Guild icon ---

function GuildIcon({ guildId, guildName, size }: { guildId: string; guildName: string; size: number; }) {
    const icon = GuildStore.getGuild(guildId)?.icon ?? null;
    const url = icon ? guildIconUrl(guildId, icon) : null;

    if (url) {
        return (
            <img
                src={url}
                alt=""
                style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
            />
        );
    }

    return (
        <div style={{
            width: size, height: size, borderRadius: "50%", flexShrink: 0,
            background: "var(--background-secondary)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: Math.round(size * 0.4), fontWeight: 700, color: "var(--text-muted)",
        }}>
            {guildName.charAt(0).toUpperCase()}
        </div>
    );
}

// --- Rows ---

function ServerRow({ guild, onClick }: { guild: GuildSummary; onClick: () => void; }) {
    const withLinks = guild.channels.filter(ch => ch.lastLinkAt !== null).length;

    return (
        <div
            onClick={onClick}
            style={{
                display: "flex", alignItems: "center",
                gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: "var(--background-mod-subtle)",
            }}
        >
            <GuildIcon guildId={guild.guildId} guildName={guild.guildName} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {guild.guildName}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                    {guild.channels.length} channel{guild.channels.length !== 1 ? "s" : ""} · {withLinks} link{withLinks !== 1 ? "s" : ""}
                </div>
            </div>
            <span style={{ fontSize: 14, color: "var(--text-muted)", flexShrink: 0 }}>›</span>
        </div>
    );
}

function ChannelRow({ ch }: { ch: ActiveChannel; }) {
    const hasLink = ch.lastLinkAt !== null;
    const code = (ch.lastLinkCode ?? "").length > 48
        ? ch.lastLinkCode!.slice(0, 48) + "…"
        : ch.lastLinkCode;

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: hasLink ? 6 : 2,
            padding: hasLink ? "10px 12px" : "8px 12px", borderRadius: 8,
            background: "var(--background-mod-subtle)",
            opacity: hasLink ? 1 : 0.55,
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: hasLink ? 600 : 500, color: "var(--text-default)" }}>
                    #{ch.channelName}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                    {hasLink
                        ? `${formatElapsedTime(Date.now() - ch.lastLinkAt!)} ago · ${ch.linkCount} link${ch.linkCount !== 1 ? "s" : ""}`
                        : `${formatElapsedTime(Date.now() - ch.lastMessageAt)} ago · ${ch.messageCount} msg${ch.messageCount !== 1 ? "s" : ""}`
                    }
                </span>
            </div>
            {hasLink && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-code)" }}>
                    {ch.lastLinkType!.toUpperCase()} · {code}
                </span>
            )}
        </div>
    );
}

// --- Modal ---

const headerTitle: React.CSSProperties = { fontWeight: 700, fontSize: "1rem", flex: 1, color: "var(--text-default)" };
const sectionLabel: React.CSSProperties = { fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" };

export function ActiveChannelsModal({ modalProps }: { modalProps: ModalProps; }) {
    const [channels, setChannels] = React.useState(() => ActiveChannelStore.getAll());
    const [selectedGuildId, setSelectedGuildId] = React.useState<string | null>(null);
    const [search, setSearch] = React.useState("");

    const guilds = React.useMemo(() => groupByGuild(channels), [channels]);

    const selectedGuild = React.useMemo(
        () => selectedGuildId ? (guilds.find(g => g.guildId === selectedGuildId) ?? null) : null,
        [guilds, selectedGuildId]
    );

    const handleSelectGuild = (guildId: string) => { setSelectedGuildId(guildId); setSearch(""); };
    const handleBack = () => { setSelectedGuildId(null); setSearch(""); };
    const handleRefresh = () => setChannels(ActiveChannelStore.getAll());
    const handleClear = () => { ActiveChannelStore.clear(); setChannels([]); setSelectedGuildId(null); setSearch(""); };

    const q = search.toLowerCase();

    // --- Channel view ---
    if (selectedGuild) {
        const filtered = selectedGuild.channels.filter(ch => !q || ch.channelName.toLowerCase().includes(q));
        const withLinks = filtered.filter(ch => ch.lastLinkAt !== null);
        const aliveOnly = filtered.filter(ch => ch.lastLinkAt === null);

        return (
            <ModalRoot {...modalProps} size={ModalSize.SMALL}>
                <ModalHeader>
                    <Button size="small" variant="none" onClick={handleBack} style={{ marginRight: "0.75rem", flexShrink: 0 }}>← Back</Button>
                    <GuildIcon guildId={selectedGuild.guildId} guildName={selectedGuild.guildName} size={22} />
                    <span style={{ ...headerTitle, marginLeft: "0.4rem", marginRight: "0.5rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{selectedGuild.guildName}</span>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginRight: "0.75rem" }}>
                        {selectedGuild.channels.length} ch · {selectedGuild.channels.filter(c => c.lastLinkAt !== null).length} links
                    </span>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </ModalHeader>
                <Divider />
                <ModalContent style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <TextInput value={search} onChange={setSearch} placeholder="Search channels…" />

                    {withLinks.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            <span style={sectionLabel}>Links detected ({withLinks.length})</span>
                            {withLinks.map(ch => <ChannelRow key={ch.channelId} ch={ch} />)}
                        </div>
                    )}

                    {aliveOnly.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                            <span style={sectionLabel}>Alive, no links ({aliveOnly.length})</span>
                            {aliveOnly.map(ch => <ChannelRow key={ch.channelId} ch={ch} />)}
                        </div>
                    )}

                    {filtered.length === 0 && (
                        <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>No channels found.</span>
                    )}
                </ModalContent>
                <ModalFooter>
                    <Button size="small" variant="dangerPrimary" onClick={handleClear}>Clear</Button>
                    <div style={{ flex: 1 }} />
                    <Button size="small" onClick={handleRefresh}>Refresh</Button>
                </ModalFooter>
            </ModalRoot>
        );
    }

    // --- Server list view ---
    const filteredGuilds = guilds.filter(g =>
        !q ||
        g.guildName.toLowerCase().includes(q) ||
        g.channels.some(ch => ch.channelName.toLowerCase().includes(q))
    );

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <span style={headerTitle}>Active Channels</span>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginRight: "0.75rem" }}>
                    {guilds.length} server{guilds.length !== 1 ? "s" : ""}
                </span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <Divider />
            <ModalContent style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <TextInput value={search} onChange={setSearch} placeholder="Search servers or channels…" />
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {filteredGuilds.length === 0
                        ? <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                            {channels.length === 0 ? "No activity detected yet." : "No results."}
                        </span>
                        : filteredGuilds.map(g => <ServerRow key={g.guildId} guild={g} onClick={() => handleSelectGuild(g.guildId)} />)
                    }
                </div>
                <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, marginTop: 4 }}>
                    These channels received messages intercepted by the plugin. It does not confirm Discord is delivering events for all channels you're in. Unloaded or inactive channels may be silent even if monitored.
                </span>
            </ModalContent>
            <ModalFooter>
                <Button size="small" variant="dangerPrimary" onClick={handleClear}>Clear</Button>
                <div style={{ flex: 1 }} />
                <Button size="small" onClick={handleRefresh}>Refresh</Button>
            </ModalFooter>
        </ModalRoot>
    );
}

export function openActiveChannelsModal() {
    openModal(p => <ActiveChannelsModal modalProps={p} />);
}
