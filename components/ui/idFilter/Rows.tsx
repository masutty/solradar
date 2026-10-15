/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyToClipboard } from "@utils/clipboard";
import { ChannelStore, GuildRoleStore, GuildStore, React, showToast, Tooltip, UserStore, useStateFromStores } from "@webpack/common";

import { IdLookup } from "./lookup";
import { isBad, resolveRow, sameRows, sortRows } from "./resolve";
import { ChipKind, NOUN, RowView } from "./types";

// --- Hook ---

/** Rows for a list of IDs, kept live by Discord's store updates and by finished lookups. */
export function useRows(kind: ChipKind, ids: string[], labels?: Record<string, string>): RowView[] {
    const [lookupVersion, setLookupVersion] = React.useState(0);
    React.useEffect(() => IdLookup.subscribe(() => setLookupVersion(v => v + 1)), []);

    return useStateFromStores(
        [GuildStore, ChannelStore, UserStore, GuildRoleStore],
        () => sortRows(ids.map(id => resolveRow(kind, id, labels?.[id]))),
        [kind, ids.join(","), lookupVersion, labels],
        sameRows,
    );
}

// --- Row ---

const STATE_TEXT: Partial<Record<RowView["state"], { badge: string; why: (r: RowView) => string; }>> = {
    notInServer: {
        badge: "Not in server",
        why: r => r.kind === "guild"
            ? "You're not in this server anymore. You left, were kicked, or it was deleted."
            : `You're not in ${r.sub ?? "this server"} anymore.`,
    },
    deleted: { badge: "Deleted", why: r => `This ${NOUN[r.kind]} no longer exists.` },
    noAccess: { badge: "No access", why: () => "This channel exists, but you can't see it. You may have left the server or lost a role." },
    notFound: { badge: "Not found", why: () => "None of your servers has this role." },
    notLoaded: { badge: "Unchecked", why: r => `No details on this ${NOUN[r.kind]} yet. Press ↻ to check it.` },
};

function RowIcon({ row }: { row: RowView; }) {
    const round = row.kind === "user" || row.kind === "role";
    const shape = round ? "vc-sora-idf-round" : "";
    if (row.state === "checking") return <span className={`vc-sora-idf-icon vc-sora-idf-ghost ${shape}`}><span className="vc-sora-idf-spin" /></span>;
    if (row.state !== "ok") return <span className={`vc-sora-idf-icon vc-sora-idf-ghost ${shape}`}>{isBad(row) ? "✕" : "?"}</span>;
    if (row.kind === "role") return <span className="vc-sora-idf-icon vc-sora-idf-round vc-sora-idf-role" style={{ background: row.color || "var(--interactive-icon-default)" }}>@</span>;
    if (row.iconUrl) return <img src={row.iconUrl} alt="" className={`vc-sora-idf-icon ${shape}`} />;
    const initial = (row.kind === "channel" ? row.sub : row.name)?.replace(/^[#@]/, "").charAt(0).toUpperCase() || "?";
    return <span className={`vc-sora-idf-icon vc-sora-idf-initial ${shape}`}>{initial}</span>;
}

export function IdRow({ row, onRemove }: { row: RowView; onRemove: () => void; }) {
    const text = STATE_TEXT[row.state];
    const bad = isBad(row);
    const tip = (
        <div className="vc-sora-idf-tip">
            {row.name && <div>{row.name}</div>}
            {row.detail && <div>{row.detail}</div>}
            {row.sub && <div>{row.sub}</div>}
            <div className="vc-sora-idf-tip-id">{row.id}</div>
            {text && <div className={bad ? "vc-sora-idf-crit" : "vc-sora-idf-warn"}>{text.why(row)}</div>}
            <div className="vc-sora-idf-tip-hint">Click to copy ID</div>
        </div>
    );

    // On desktop copyToClipboard may not return a promise, so await it instead of chaining .then
    const copy = async () => {
        try {
            await copyToClipboard(row.id);
            showToast({ text: "Copied ID", variant: "success" });
        } catch {
            showToast({ text: "Couldn't copy the ID", variant: "critical" });
        }
    };

    return (
        <div className={`vc-sora-idf-row ${bad ? "vc-sora-idf-row-bad" : row.state === "notLoaded" ? "vc-sora-idf-row-unk" : ""}`}>
            <RowIcon row={row} />
            <span className="vc-sora-idf-who">
                <Tooltip text={tip}>
                    {props => (
                        <span {...props} className={`vc-sora-idf-name ${bad ? "vc-sora-idf-gone" : ""}`} onClick={copy}>
                            {row.name ?? `Unknown ${NOUN[row.kind]}`}
                        </span>
                    )}
                </Tooltip>
                {row.sub && row.state === "ok" && <span className="vc-sora-idf-sub">{row.sub}</span>}
            </span>
            {text && <span className={`vc-sora-idf-badge ${bad ? "vc-sora-idf-badge-crit" : "vc-sora-idf-badge-warn"}`}>{text.badge}</span>}
            {row.state === "checking" && <span className="vc-sora-idf-sub">Checking…</span>}
            <span className="vc-sora-idf-acts">
                {(row.state === "notLoaded" || row.state === "checking") && (
                    <Tooltip text={`Check this ${NOUN[row.kind]}`}>
                        {props => (
                            <button
                                {...props}
                                type="button"
                                className="vc-sora-idf-btn vc-sora-idf-btn-hot"
                                disabled={row.state === "checking"}
                                aria-label="Check"
                                onClick={() => IdLookup.request(row.kind, row.id)}
                            >↻</button>
                        )}
                    </Tooltip>
                )}
                <button type="button" className="vc-sora-idf-btn vc-sora-idf-btn-rm" aria-label="Remove" onClick={onRemove}>×</button>
            </span>
        </div>
    );
}

// --- Banner ---

export function ProblemBanner({ kind, rows, onRemoveBad }: { kind: ChipKind; rows: RowView[]; onRemoveBad: () => void; }) {
    const n = rows.filter(isBad).length;
    if (!n) return null;
    const many = n > 1;
    return (
        <div className="vc-sora-idf-banner">
            <span>{n} {NOUN[kind]}{many ? "s" : ""} in this list {many ? "no longer exist or aren't" : "no longer exists or isn't"} reachable.</span>
            <button type="button" onClick={onRemoveBad}>Remove {many ? "them" : "it"}</button>
        </div>
    );
}

export { RowIcon };
