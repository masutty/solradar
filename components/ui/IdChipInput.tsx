/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./IdChipInput.css";

import { React } from "@webpack/common";

import { openFullList } from "./idFilter/FullListModal";
import { isBad } from "./idFilter/resolve";
import { IdRow, ProblemBanner, RowIcon, useRows } from "./idFilter/Rows";
import { SearchBox } from "./idFilter/SearchBox";
import { ChipKind } from "./idFilter/types";

export type { ChipKind } from "./idFilter/types";

const VISIBLE_ROWS = 5;

/**
 * A searchable list of server, channel, user or role IDs.
 * Search and rows read Discord's memory only. The one request it can send is the ↻
 * lookup on a single row, and only when clicked.
 */
export function IdChipInput({ kind, label, hint, ids, labels, onChange }: {
    kind: ChipKind;
    label: React.ReactNode;
    hint?: string;
    ids: string[];
    /** names to show when an ID can't be resolved and nothing is remembered for it */
    labels?: Record<string, string>;
    onChange: (ids: string[]) => void;
}) {
    const rows = useRows(kind, ids, labels);
    const shown = rows.slice(0, VISIBLE_ROWS);
    const hidden = rows.slice(VISIBLE_ROWS);

    const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
    const removeBad = () => {
        const bad = new Set(rows.filter(isBad).map(r => r.id));
        onChange(ids.filter(id => !bad.has(id)));
    };

    return (
        <div className="vc-sora-chip-wrapper">
            <div className="vc-sora-idf-head">
                {label && <span className="vc-sora-chip-label">{label}</span>}
                {ids.length > 0 && <span className="vc-sora-idf-count">{ids.length}</span>}
            </div>
            {hint && <span className="vc-sora-chip-hint">{hint}</span>}

            <ProblemBanner kind={kind} rows={rows} onRemoveBad={removeBad} />

            {rows.length > 0 && (
                <div className="vc-sora-idf-rows">
                    {shown.map(r => <IdRow key={r.id} row={r} onRemove={() => onChange(ids.filter(i => i !== r.id))} />)}
                    {hidden.length > 0 && (
                        <button
                            type="button"
                            className="vc-sora-idf-more"
                            onClick={() => openFullList({ kind, title: label, ids, labels, onChange })}
                        >
                            <span className="vc-sora-idf-stack">
                                {hidden.slice(0, 3).map(r => <RowIcon key={r.id} row={r} />)}
                            </span>
                            Show all {rows.length}
                            <span className="vc-sora-idf-sub">· {hidden.length} more</span>
                        </button>
                    )}
                </div>
            )}

            <SearchBox kind={kind} ids={ids} onToggle={toggle} />
        </div>
    );
}
