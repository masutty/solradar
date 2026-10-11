/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, TextInput, useState } from "@webpack/common";

import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../LegacyModal";
import { isBad } from "./resolve";
import { IdRow, ProblemBanner, useRows } from "./Rows";
import { ChipKind } from "./types";

interface FullListProps {
    kind: ChipKind;
    title: React.ReactNode;
    ids: string[];
    labels?: Record<string, string>;
    onChange: (ids: string[]) => void;
}

function FullListModal({ modalProps, kind, title, ids: initialIds, labels, onChange }: FullListProps & { modalProps: ModalProps; }) {
    // The caller's props don't update while the modal is open, so the list lives here
    const [ids, setIds] = useState(initialIds);
    const [filter, setFilter] = useState("");
    const rows = useRows(kind, ids, labels);

    const update = (next: string[]) => { setIds(next); onChange(next); };
    const q = filter.trim().toLowerCase();
    const shown = q
        ? rows.filter(r => r.id.includes(q) || r.name?.toLowerCase().includes(q) || r.sub?.toLowerCase().includes(q))
        : rows;

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <div className="vc-sora-idf-full-title">
                    <span>{title}</span>
                    <span className="vc-sora-idf-count">{ids.length}</span>
                </div>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <ModalContent className="vc-sora-idf-full">
                <TextInput value={filter} placeholder="Filter this list" onChange={setFilter} autoFocus />
                <ProblemBanner kind={kind} rows={rows} onRemoveBad={() => {
                    const bad = new Set(rows.filter(isBad).map(r => r.id));
                    update(ids.filter(id => !bad.has(id)));
                }} />
                <div className="vc-sora-idf-rows">
                    {shown.map(r => <IdRow key={r.id} row={r} onRemove={() => update(ids.filter(i => i !== r.id))} />)}
                    {shown.length === 0 && <div className="vc-sora-idf-empty">Nothing in this list matches.</div>}
                </div>
            </ModalContent>
        </ModalRoot>
    );
}

export function openFullList(props: FullListProps) {
    openModal(modalProps => <FullListModal modalProps={modalProps} {...props} />);
}
