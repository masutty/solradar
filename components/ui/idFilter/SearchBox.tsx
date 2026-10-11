/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, ScrollerThin, TextInput, useState } from "@webpack/common";

import { searchIds, SearchResult } from "./search";
import { ChipKind } from "./types";

const PLACEHOLDER: Record<ChipKind, string> = {
    guild: "Search servers or paste an ID",
    channel: "Search channels or servers, or paste an ID",
    user: "Search users or paste an ID",
    role: "Search roles or servers, or paste an ID",
};

function ResultIcon({ kind, r }: { kind: ChipKind; r: SearchResult; }) {
    const round = kind === "user" || kind === "role" ? "vc-sora-idf-round" : "";
    if (r.raw) return <span className={`vc-sora-idf-icon vc-sora-idf-ghost ${round}`}>?</span>;
    if (kind === "role") return <span className="vc-sora-idf-icon vc-sora-idf-round vc-sora-idf-role" style={{ background: r.color || "var(--interactive-icon-default)" }}>@</span>;
    if (r.iconUrl) return <img src={r.iconUrl} alt="" className={`vc-sora-idf-icon ${round}`} />;
    const initial = (kind === "channel" ? r.sub : r.name)?.replace(/^[#@]/, "").charAt(0).toUpperCase() || "?";
    return <span className={`vc-sora-idf-icon vc-sora-idf-initial ${round}`}>{initial}</span>;
}

function Highlight({ text, query }: { text: string; query: string; }) {
    const q = query.trim();
    const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return <>{text}</>;
    return <>{text.slice(0, i)}<mark className="vc-sora-idf-mark">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

/** Search field with an in-flow results list. Enter or a click toggles the item in `ids`. */
export function SearchBox({ kind, ids, onToggle }: { kind: ChipKind; ids: string[]; onToggle: (id: string) => void; }) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);

    const results = React.useMemo(() => (open ? searchIds(kind, query) : []), [open, kind, query]);
    const listRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    const pick = (r: SearchResult | undefined) => {
        if (!r) return;
        onToggle(r.id);
        setQuery("");
        setActive(0);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { setActive(a => Math.min(a + 1, results.length - 1)); e.preventDefault(); }
        else if (e.key === "ArrowUp") { setActive(a => Math.max(a - 1, 0)); e.preventDefault(); }
        else if (e.key === "Enter") { pick(results[active]); e.preventDefault(); }
        else if (e.key === "Escape" && open) { setOpen(false); e.preventDefault(); e.stopPropagation(); }
    };

    return (
        <div className="vc-sora-idf-search">
            <TextInput
                value={query}
                placeholder={PLACEHOLDER[kind]}
                onChange={(v: string) => { setQuery(v); setActive(0); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onKeyDown={onKeyDown}
            />
            {open && (
                <div className="vc-sora-idf-dropdown" ref={listRef} onMouseDown={e => e.preventDefault()}>
                    <ScrollerThin style={{ maxHeight: 240 }}>
                        {results.length === 0 && (
                            <div className="vc-sora-idf-empty">
                                {query.trim() ? `Nothing matches "${query.trim()}". Try pasting the ID instead.` : "Nothing to show yet."}
                            </div>
                        )}
                        {results.map((r, i) => (
                            <div
                                key={r.id}
                                data-i={i}
                                className={`vc-sora-idf-opt ${i === active ? "vc-sora-idf-opt-active" : ""}`}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => pick(r)}
                            >
                                <ResultIcon kind={kind} r={r} />
                                {r.raw
                                    ? <span className="vc-sora-idf-opt-name vc-sora-idf-warn">Add {r.id}</span>
                                    : (
                                        <span className="vc-sora-idf-opt-name">
                                            <Highlight text={r.name} query={query} />
                                            {r.sub && <span className="vc-sora-idf-sub"> <Highlight text={r.sub} query={query} /></span>}
                                        </span>
                                    )}
                                {r.raw && <span className="vc-sora-idf-sub">{kind === "channel" || kind === "user" ? "you can check it after adding" : "not found in your servers"}</span>}
                                {ids.includes(r.id) && <span className="vc-sora-idf-added">✓ added</span>}
                            </div>
                        ))}
                    </ScrollerThin>
                    {results.length > 0 && (
                        <div className="vc-sora-idf-dd-foot">
                            <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
                            <span><kbd>Enter</kbd> add / remove</span>
                            <span><kbd>Esc</kbd> close</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
