/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildStore, RestAPI, showToast, UserUtils } from "@webpack/common";

import { Logger } from "../../../logger";
import { KnownNamesStore } from "./KnownNamesStore";
import { ChipKind } from "./types";

// One-shot lookups for channels and users Discord hasn't loaded.
// Only ever started by a click on one row. Requests run one at a time with a gap
// between them, so even fast clicking can't burst the API.

const logger = new Logger("SolRadar.IdLookup");
const GAP_MS = 750;

export type LookupResult = "found" | "deleted" | "noAccess";

const results = new Map<string, LookupResult>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let queue: Promise<unknown> = Promise.resolve();

function emit() { listeners.forEach(l => l()); }

export const IdLookup = {
    subscribe(fn: () => void) {
        listeners.add(fn);
        return () => { listeners.delete(fn); };
    },
    isPending: (id: string) => pending.has(id),
    result: (id: string) => results.get(id),

    request(kind: ChipKind, id: string) {
        if (pending.has(id) || (kind !== "channel" && kind !== "user")) return;
        pending.add(id);
        emit();
        queue = queue
            .then(() => (kind === "channel" ? lookupChannel(id) : lookupUser(id)))
            .catch(err => {
                logger.warn(`Lookup of ${kind} ${id} failed:`, err);
                showToast({ text: `Couldn't check this ${kind}. Try again later.`, variant: "critical" });
            })
            .finally(() => { pending.delete(id); emit(); })
            .then(() => new Promise(r => setTimeout(r, GAP_MS)));
    },
};

function statusOf(err: unknown): number | undefined {
    return typeof err === "object" && err !== null && "status" in err ? (err as { status: number; }).status : undefined;
}

async function lookupChannel(id: string) {
    try {
        const { body } = await RestAPI.get({ url: `/channels/${id}` });
        const guildId: string | undefined = body?.guild_id;
        KnownNamesStore.remember(id, { name: body?.name ?? id, guildId, guildName: guildId ? GuildStore.getGuild(guildId)?.name : undefined });
        results.set(id, "found");
    } catch (err) {
        const status = statusOf(err);
        if (status === 404) results.set(id, "deleted");
        else if (status === 403) results.set(id, "noAccess");
        else throw err;
    }
}

async function lookupUser(id: string) {
    try {
        // Stores the user in UserStore, so the row resolves through the store afterwards
        const user = await UserUtils.getUser(id);
        if (isDeletedUser(user)) { results.set(id, "deleted"); return; }
        KnownNamesStore.remember(id, { name: user.globalName ?? user.username });
        results.set(id, "found");
    } catch (err) {
        if (statusOf(err) === 404) results.set(id, "deleted");
        else throw err;
    }
}

export function isDeletedUser(user: { username?: string; } | undefined) {
    return !!user?.username && /^deleted_user_[0-9a-f]+$/i.test(user.username);
}
