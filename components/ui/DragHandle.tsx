/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DragHandle.css";
import "./OrderSlot.css";

import { React } from "@webpack/common";

import { GripIcon } from "../icons/GripIcon";

interface DragHandleProps {
    visible: boolean;
    onPointerDownHandle: (e: React.PointerEvent<HTMLDivElement>) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

// Hover-revealed handle for dragging a trigger. Arrow keys also work, for keyboard users.
// The drag itself runs on pointer events in TriggersTab.
export function DragHandle({ visible, onPointerDownHandle, onMoveUp, onMoveDown }: DragHandleProps) {
    return (
        <div
            className={`vc-sora-orderslot vc-sora-draghandle${visible ? " visible" : ""}`}
            onPointerDown={e => {
                // Capture the pointer so the click fired on release lands here and is stopped,
                // instead of opening the card under the cursor
                e.currentTarget.setPointerCapture(e.pointerId);
                onPointerDownHandle(e);
            }}
            onClick={e => e.stopPropagation()}
            onContextMenu={e => e.stopPropagation()}
            tabIndex={0}
            role="button"
            aria-label="Reorder trigger"
            title="Drag to reorder · ↑/↓ to move"
            onKeyDown={e => {
                if (e.key === "ArrowUp") { e.preventDefault(); onMoveUp(); }
                else if (e.key === "ArrowDown") { e.preventDefault(); onMoveDown(); }
            }}
        >
            <GripIcon />
        </div>
    );
}
