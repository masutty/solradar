/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./QuerySearchInput.css";

import { React, TextInput, Tooltip, useState } from "@webpack/common";

/** Splits a query into words and the whitespace between them (words at odd indexes). A quoted part stays inside its word, spaces included. */
export function splitQuery(value: string): string[] {
    return value.split(/((?:[^\s"]|"[^"]*"?)+)/);
}

/**
 * Search field that paints the words `describe` returns text for like inline code, so query syntax
 * stands out from free text. Hovering such a word shows that text as a tooltip.
 */
export function QuerySearchInput({ value, onChange, placeholder, describe, isNegation, suffix }: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    describe: (word: string) => string | undefined;
    /** Words that exclude results get red text */
    isNegation?: (word: string) => boolean;
    /** Short text at the right end of the field, such as a result count */
    suffix?: string;
}) {
    const wrapRef = React.useRef<HTMLDivElement>(null);
    const mirrorRef = React.useRef<HTMLDivElement>(null);
    const [tip, setTip] = useState<{ text: string; left: number; width: number; } | null>(null);

    const sync = () => {
        const input = wrapRef.current?.querySelector("input");
        if (input && mirrorRef.current) mirrorRef.current.scrollLeft = input.scrollLeft;
    };
    React.useEffect(sync, [value]);

    // The mirror sits under the input and ignores the mouse, so find the hovered term by position
    const onMouseMove = (e: React.MouseEvent) => {
        sync();
        const wrap = wrapRef.current;
        if (!wrap) return;
        for (const el of wrap.querySelectorAll<HTMLElement>("[data-tip]")) {
            const r = el.getBoundingClientRect();
            if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                const base = wrap.getBoundingClientRect().left;
                setTip({ text: el.dataset.tip!, left: r.left - base, width: r.width });
                return;
            }
        }
        setTip(null);
    };

    return (
        <div ref={wrapRef} className={`vc-sora-qsearch${suffix ? " vc-sora-qsearch-suffixed" : ""}`} onScroll={sync} onKeyUp={sync} onMouseMove={onMouseMove} onMouseLeave={() => setTip(null)}>
            <div ref={mirrorRef} className="vc-sora-qsearch-mirror" aria-hidden>
                <span>
                    {splitQuery(value).map((part, i) => {
                        const text = describe(part);
                        return text
                            ? <span key={i} className={`vc-sora-qsearch-term${isNegation?.(part) ? " vc-sora-qsearch-term-not" : ""}`} data-tip={text}>{part}</span>
                            : part;
                    })}
                </span>
            </div>
            <TextInput value={value} onChange={onChange} spellCheck={false} placeholder={placeholder} />
            {suffix && <span className="vc-sora-qsearch-suffix">{suffix}</span>}
            {tip && (
                <Tooltip text={tip.text} forceOpen position="bottom">
                    {props => <span {...props} className="vc-sora-qsearch-anchor" style={{ left: tip.left, width: tip.width }} />}
                </Tooltip>
            )}
        </div>
    );
}
