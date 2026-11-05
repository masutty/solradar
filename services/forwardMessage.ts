/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CardLayout, ForwardShow, TriggerForwarding, TriggerType, TYPE_COLORS } from "../stores/TriggerStore";

// Builds the JSON body of a forwarded webhook message. It has no Discord or store access, so the
// trigger editor builds its preview from the same code that sends the real message.

export type ForwardKind = "match" | "detection";

export interface ForwardInput {
    forwarding: TriggerForwarding;
    kind: ForwardKind;
    triggerName: string;
    triggerType: TriggerType;
    /** What a thumbnail points at: a link, or "attachment://icon.webp" for an icon sent as a file */
    iconRef?: string;
    /** Whether the trigger has a biome to confirm. Without one there is no biome status. */
    hasBiome: boolean;
    senderId: string;
    senderName: string;
    serverLink: string;
    jumpUrl: string;
    guildName: string;
    channelId: string;
    channelName: string;
    guildId: string;
    /** What the sender wrote, already stripped of the links */
    userMessage: string;
    /** Seconds since the epoch, for the relative time */
    sentAt: number;
    /** Hides the sender, for the "censor webhooks" setting */
    censor?: boolean;
}

export const COMPONENTS_V2_FLAG = 1 << 15;
export const ICON_ATTACHMENT = "attachment://icon.webp";
export const TEXT_LIMIT = 4000;

export interface LayoutMeta {
    name: string;
    description: string;
    /** The parts of `show` this layout draws. The others have no effect on it. */
    uses: (keyof ForwardShow)[];
}

export const CARD_LAYOUTS: Record<CardLayout, LayoutMeta> = {
    compact: { name: "Compact", description: "A short card with the buttons at the bottom.", uses: ["sender", "where", "biome", "time", "join", "jump"] },
    quote: { name: "Message first", description: "Shows what the sender wrote, with who and where above it.", uses: ["icon", "sender", "where", "biome", "message", "time", "join", "jump"] },
    terminal: { name: "Terminal", description: "Everything aligned in one block.", uses: ["sender", "where", "biome", "message", "time", "join", "jump"] },
    timeline: { name: "Timeline", description: "Shows what happened, step by step.", uses: ["icon", "sender", "where", "biome", "time", "join", "jump"] },
    actions: { name: "Action rows", description: "Two clear destinations, each with its own button.", uses: ["icon", "sender", "where", "biome", "time", "join", "jump"] },
};

export const EMBED_USES: (keyof ForwardShow)[] = ["icon", "time", "sender", "where", "biome"];

// --- Text helpers ---

const ZWSP = "​";
const MESSAGE_MAX = 300;

function escapeMd(text: string): string {
    return text.replace(/([\\*_`~|[\]<>])/g, "\\$1");
}

/** The sender's words as a quote that cannot ping anyone or break out of the quote. */
function quote(text: string): string {
    const clean = text.replace(/@/g, `@${ZWSP}`).trim();
    const cut = clean.length > MESSAGE_MAX ? `${clean.slice(0, MESSAGE_MAX - 1)}…` : clean;
    return cut.split(/\r?\n/).filter(l => l.trim()).map(l => `> ${l}`).join("\n");
}

const hex = (color: string) => parseInt(color.replace("#", ""), 16) || 0;

function accent(i: ForwardInput): number {
    if (i.kind === "detection") return 0x3ba55d;
    return hex(i.forwarding.accentColor || TYPE_COLORS[i.triggerType]);
}

const statusOf = (i: ForwardInput) => i.kind === "detection" ? "✅ Verified" : "⚠️ Not verified";
const titleOf = (i: ForwardInput) => `${i.kind === "detection" ? "✅" : "🎯"} [${escapeMd(i.triggerName)}](${i.serverLink})`;
const footerOf = (i: ForwardInput, prefix?: string) =>
    `-# ${[prefix, i.forwarding.show.time && `<t:${i.sentAt}:R>`, "SolRadar"].filter(Boolean).join(" · ")}`;
const senderOf = (i: ForwardInput) => i.censor ? "[REDACTED]" : `<@${i.senderId}>`;
const channelLink = (i: ForwardInput) => `[#${escapeMd(i.channelName)}](https://discord.com/channels/${i.guildId}/${i.channelId})`;
const userMessageBlock = (i: ForwardInput) => {
    const q = i.forwarding.show.message ? quote(i.userMessage) : "";
    return q ? `- User message:\n${q}` : "";
};

// --- Components V2 pieces ---

const text = (content: string) => ({ type: 10, content });
const separator = () => ({ type: 14, divider: true, spacing: 1 });
const thumbnail = (url: string) => ({ type: 11, media: { url } });
const linkButton = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const actionRow = (buttons: object[]) => ({ type: 1, components: buttons });
const section = (content: string, accessory: object) => ({ type: 9, components: [text(content)], accessory });
const container = (components: object[], color: number) => ({ type: 17, accent_color: color, components });

function buttonsOf(i: ForwardInput): object[] {
    const { show } = i.forwarding;
    const out: object[] = [];
    if (show.join) out.push(linkButton("Join Server", i.serverLink));
    if (show.jump) out.push(linkButton("Jump to Message", i.jumpUrl));
    return out;
}

/** The title block: next to the trigger icon when there is one */
function withIcon(i: ForwardInput, content: string, iconRef = i.iconRef): object {
    return i.forwarding.show.icon && iconRef ? section(content, thumbnail(iconRef)) : text(content);
}

const lines = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join("\n");

function whoWhere(i: ForwardInput): string {
    const { show } = i.forwarding;
    return [
        show.sender && `Sent by ${senderOf(i)}`,
        show.where && `${show.sender ? "in" : "In"} ${channelLink(i)} · ${escapeMd(i.guildName)}`,
    ].filter(Boolean).join(" ");
}

const biomeBullet = (i: ForwardInput) => i.hasBiome && i.forwarding.show.biome ? `- \`${statusOf(i)}\`` : "";

const LAYOUT_BUILDERS: Record<CardLayout, (i: ForwardInput) => object[]> = {
    compact(i) {
        const { show, webhookEmbedDescription } = i.forwarding;
        const meta = [
            show.sender && `Sent by ${senderOf(i)}`,
            show.where && `in ${channelLink(i)}`,
            i.hasBiome && show.biome && statusOf(i),
        ].filter(Boolean).join(" · ");
        const parts: object[] = [text(lines(`## ${titleOf(i)}`, webhookEmbedDescription.trim(), meta && `-# ${meta}`))];
        const buttons = buttonsOf(i);
        if (buttons.length) parts.push(separator(), actionRow(buttons));
        parts.push(text(footerOf(i)));
        return parts;
    },

    quote(i) {
        const { webhookEmbedDescription } = i.forwarding;
        const context = whoWhere(i);
        const parts: object[] = [withIcon(i, lines(`### ${titleOf(i)}`, webhookEmbedDescription.trim(), context && `-# ${context}`))];
        const body = lines(userMessageBlock(i), biomeBullet(i));
        if (body) parts.push(separator(), text(body));
        const buttons = buttonsOf(i);
        if (buttons.length) parts.push(separator(), actionRow(buttons));
        parts.push(text(footerOf(i)));
        return parts;
    },

    terminal(i) {
        const { show, webhookEmbedDescription } = i.forwarding;
        const esc = "\u001b";
        const value = (v: string, code = "1;37") => `${esc}[${code}m${v.replace(/`/g, "'")}${esc}[0m`;
        const row = (label: string, v: string, code?: string) => `${esc}[0;30m${label.padEnd(8)}${esc}[0m${value(v, code)}`;
        const rows = [row("Trigger", i.triggerName, "1;36")];
        if (show.sender) rows.push(row("From", i.censor ? "[REDACTED]" : i.senderName));
        if (show.where) rows.push(row("Server", i.guildName), row("Channel", `#${i.channelName}`));
        if (i.hasBiome && show.biome) rows.push(row("Biome", i.kind === "detection" ? "verified" : "not verified", i.kind === "detection" ? "1;32" : "1;33"));
        const block = `\`\`\`ansi\n${rows.join("\n")}\n\`\`\``;
        const parts: object[] = [text(lines(`## ${titleOf(i)}`, webhookEmbedDescription.trim(), block, userMessageBlock(i)))];
        const buttons = buttonsOf(i);
        if (buttons.length) parts.push(separator(), actionRow(buttons));
        parts.push(text(footerOf(i)));
        return parts;
    },

    timeline(i) {
        const { show, webhookEmbedDescription } = i.forwarding;
        const steps: string[] = [];
        if (show.sender || show.where) {
            steps.push(`- 💬 ${[show.sender && senderOf(i), show.where && `posted in ${channelLink(i)}`].filter(Boolean).join(" ")}`);
        }
        steps.push(`- 🎯 Matched **${escapeMd(i.triggerName)}**`);
        // On match the biome is not confirmed yet, so its status takes the place of the confirmation line
        if (i.hasBiome && show.biome) steps.push(i.kind === "detection" ? "- ✅ Biome confirmed" : `- \`${statusOf(i)}\``);
        const parts: object[] = [
            withIcon(i, lines(`## ${titleOf(i)}`, webhookEmbedDescription.trim())),
            separator(),
            text(steps.join("\n")),
        ];
        const buttons = buttonsOf(i);
        if (buttons.length) parts.push(actionRow(buttons));
        parts.push(text(footerOf(i)));
        return parts;
    },

    actions(i) {
        const { show, webhookEmbedDescription } = i.forwarding;
        const parts: object[] = [withIcon(i, lines(`## ${titleOf(i)}`, webhookEmbedDescription.trim(), biomeBullet(i)))];
        if (show.join || show.jump) parts.push(separator());
        if (show.join) parts.push(section("**Server link**\n-# Join the server and look for the biome", linkButton("Join", i.serverLink)));
        if (show.jump) {
            const where = show.where ? `${channelLink(i)} · ${escapeMd(i.guildName)}` : "See what was said";
            parts.push(section(`**Original message**\n-# ${where}`, linkButton("Jump", i.jumpUrl)));
        }
        parts.push(separator(), text(footerOf(i, show.sender ? `Sent by ${senderOf(i)}` : undefined)));
        return parts;
    },
};

// --- Payloads ---

export interface ForwardPayload {
    body: object;
    /** Whether the body uses Components V2, which the webhook URL must ask for */
    components: boolean;
}

function buildEmbed(i: ForwardInput): ForwardPayload {
    const { forwarding, kind } = i;
    const { show } = forwarding;
    const serverLink = `[🔗 Server Link](${i.serverLink})`;
    const custom = forwarding.webhookEmbedDescription;
    const fields: object[] = [];
    if (show.sender) fields.push({ name: "Sent by", value: i.censor ? "```[REDACTED]```" : `<@${i.senderId}>`, inline: true });
    if (show.where) fields.push({ name: "Sent in", value: i.censor ? "```[REDACTED]```" : i.jumpUrl, inline: true });
    if (i.hasBiome && show.biome) fields.push({ name: "Biome", value: `\`\`\`${statusOf(i)}\`\`\``, inline: false });

    return {
        components: false,
        body: {
            content: forwarding.webhookContent || null,
            embeds: [{
                title: kind === "detection" ? `✅ ${i.triggerName}` : `🎯 ${i.triggerName} (click to join)`,
                description: custom ? `${custom}\n${serverLink}` : serverLink,
                url: i.serverLink,
                thumbnail: show.icon && i.iconRef ? { url: i.iconRef } : undefined,
                fields,
                color: accent(i),
                timestamp: show.time ? new Date(i.sentAt * 1000).toISOString() : undefined,
                footer: { text: "SolRadar" },
            }],
        },
    };
}

function buildCard(input: ForwardInput): ForwardPayload {
    // Censoring hides who sent it and where, so the layouts must not draw the channel, the server, the message or the jump link
    const i: ForwardInput = input.censor
        ? { ...input, forwarding: { ...input.forwarding, show: { ...input.forwarding.show, where: false, jump: false, message: false } } }
        : input;
    const message = i.forwarding.webhookContent.trim();
    const make = (messageText: string) => ({
        flags: COMPONENTS_V2_FLAG,
        // Users are never pinged, so the sender named in the card stays quiet. Roles and @everyone still work in the message text.
        allowed_mentions: { parse: ["roles", "everyone"] },
        components: [
            ...(messageText ? [text(messageText)] : []),
            container(LAYOUT_BUILDERS[i.forwarding.layout](i), accent(i)),
        ],
    });

    // The message text is the only part of the card that can be very long: cut it if the total goes over the limit
    let body = make(message);
    const over = countText((body as any).components) - TEXT_LIMIT;
    if (over > 0) body = make(message.slice(0, Math.max(0, message.length - over - 1)));
    return { body, components: true };
}

export function buildForwardPayload(input: ForwardInput): ForwardPayload {
    return input.forwarding.format === "card" ? buildCard(input) : buildEmbed(input);
}

/** Text characters in a component tree: Discord caps the total of a V2 message */
function countText(components: any[]): number {
    let total = 0;
    const walk = (list: any[]) => {
        for (const c of list ?? []) {
            if (typeof c.content === "string") total += c.content.length;
            if (c.accessory) walk([c.accessory]);
            if (c.components) walk(c.components);
        }
    };
    walk(components);
    return total;
}
