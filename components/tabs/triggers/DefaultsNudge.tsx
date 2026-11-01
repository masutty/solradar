/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ImportPicker.css";

import { Button } from "@components/Button";
import { React } from "@webpack/common";

import { DefaultChanges, DefaultTrigger } from "../../../stores/defaultTriggers";

// --- Copy ---

function Names({ list, color }: { list: DefaultTrigger[]; color: string; }) {
    const bold = (d: DefaultTrigger) => <b style={{ color }}>{d.name}</b>;
    if (list.length === 1) return bold(list[0]);
    if (list.length === 2) return <>{bold(list[0])} and {bold(list[1])}</>;
    return <>{bold(list[0])} and {list.length - 1} more</>;
}

function Summary({ changes }: { changes: DefaultChanges; }) {
    const { added, updated } = changes;
    const newPart = added.length > 0 && <><Names list={added} color="#3ba55d" /> {added.length === 1 ? "is" : "are"} new</>;
    const updatedPart = updated.length > 0 && <><Names list={updated} color="#00a8fc" /> {updated.length === 1 ? "was" : "were"} updated</>;

    return <>{newPart}{newPart && updatedPart && ", and "}{updatedPart}.</>;
}

// --- Popover ---

/** Sits inside a relatively positioned wrapper around the more button. */
export function DefaultsNudge({ changes, onDismiss, onOpen }: { changes: DefaultChanges; onDismiss: () => void; onOpen: () => void; }) {
    return (
        <div className="vc-sora-nudge" role="dialog" aria-label="Default triggers changed">
            <span className="vc-sora-nudge-arrow" />
            <div>
                <div className="vc-sora-nudge-title">Default triggers changed</div>
                <div className="vc-sora-nudge-body"><Summary changes={changes} /></div>
            </div>
            <div className="vc-sora-nudge-actions">
                <Button size="small" variant="secondary" onClick={onDismiss}>Not now</Button>
                <Button size="small" variant="primary" onClick={onOpen}>Take a look</Button>
            </div>
        </div>
    );
}
