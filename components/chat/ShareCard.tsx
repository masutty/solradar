/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ShareCard.css";
import "../tabs/triggers/triggers.css";

import { Button } from "@components/Button";
import { Message } from "@vencord/discord-types";
import { ReactNode } from "react";
import { showToast, Tooltip, useEffect, useMemo, useState } from "@webpack/common";

import { settings } from "../../settings";
import { getFolder, ImportedTrigger, importTriggers, sameTrigger, updateFromFile, useTriggers } from "../../stores/TriggerStore";
import { TriggerIcon, TYPE_META } from "../tabs/triggers/editor/sections";
import { FolderTag } from "../tabs/triggers/folders";
import { importSummary, openFilePicker } from "../tabs/triggers/ImportPicker";
import { loadAttachment, shareSource } from "./shareDetect";

const NO_FOLDER_COLOR = "#949ba4";
const NAMES_SHOWN = 3;
const FOLDERS_SHOWN = 2;

const TYPE_TIPS: Record<string, string> = {
    CUSTOM: "Custom trigger: matches its own keywords",
    RARE_BIOME: "Snipes a rare biome",
    EVENT_BIOME: "Snipes an event biome"
};

interface Group {
    key: string;
    name: string;
    color: string;
    items: ImportedTrigger[];
    mine: boolean;
}

function groupByFolder(triggers: ImportedTrigger[]): Group[] {
    const groups: Group[] = [];
    for (const t of triggers) {
        const key = t.folder?.id ?? "";
        let g = groups.find(x => x.key === key);
        if (!g) {
            const mine = getFolder(t.folder?.id);
            g = {
                key,
                name: mine?.name ?? t.folder?.name ?? "No folder",
                color: mine?.color ?? t.folder?.color ?? NO_FOLDER_COLOR,
                items: [],
                mine: !!mine
            };
            groups.push(g);
        }
        g.items.push(t);
    }
    return groups.sort((a, b) => Number(a.key === "") - Number(b.key === ""));
}

function folderTip(g: Group): string {
    const names = g.items.map(t => t.name).join(", ");
    const n = g.items.length;
    if (!g.key) return n === 1 ? `1 trigger isn't in a folder: ${names}` : `${n} triggers aren't in a folder: ${names}`;
    const where = g.mine ? `your ${g.name} folder` : `a new ${g.name} folder`;
    return n === 1 ? `Goes into ${where}` : `These ${n} triggers go into ${where}: ${names}`;
}

function InfoIcon({ one }: { one: boolean; }) {
    const text = `Someone shared ${one ? "a trigger" : "triggers"} in this message. Import to add ${one ? "it" : "them"} to your trigger list.`;
    return (
        <Tooltip text={text}>
            {props => (
                <span {...props} className="vc-sora-share-info">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2Zm0-8h-2V7h2Z" />
                    </svg>
                </span>
            )}
        </Tooltip>
    );
}

function CheckIcon() {
    return (
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
        </svg>
    );
}

function Skeleton() {
    return (
        <div className="vc-sora-share-card" aria-busy="true">
            <div className="vc-sora-share-row">
                <span className="vc-sora-share-skel" style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0 }} />
                <span className="vc-sora-share-main">
                    <span className="vc-sora-share-skel" style={{ height: 16, width: "55%" }} />
                    <span className="vc-sora-share-skel" style={{ height: 14, width: "35%" }} />
                </span>
            </div>
        </div>
    );
}

function GroupTag({ g }: { g: Group; }) {
    return (
        <span className="vc-sora-share-group">
            <FolderTag name={g.name} color={g.color} tooltip={folderTip(g)} />
            <span className="vc-sora-share-count">{g.items.length}</span>
        </span>
    );
}

function Plus({ text, tip }: { text: string; tip: string; }) {
    return (
        <Tooltip text={tip}>
            {props => <span {...props} className="vc-sora-share-plus">{text}</span>}
        </Tooltip>
    );
}

function SingleSummary({ trigger }: { trigger: ImportedTrigger; }) {
    const meta = TYPE_META[trigger.type];
    const [group] = groupByFolder([trigger]);
    return (
        <>
            <TriggerIcon draft={trigger} size={56} />
            <span className="vc-sora-share-main">
                <Tooltip text={trigger.name}>
                    {props => <span {...props} className="vc-sora-share-name">{trigger.name}</span>}
                </Tooltip>
                <span className="vc-sora-share-tags">
                    <Tooltip text={TYPE_TIPS[trigger.type] ?? meta.label}>
                        {props => <span {...props} className="vc-sora-share-type" style={{ "--sora-tc": meta.color } as React.CSSProperties}>{meta.label}</span>}
                    </Tooltip>
                    {group.key && <FolderTag name={group.name} color={group.color} tooltip={folderTip(group)} />}
                </span>
            </span>
        </>
    );
}

function MultiSummary({ triggers }: { triggers: ImportedTrigger[]; }) {
    const rest = triggers.slice(NAMES_SHOWN);
    const groups = groupByFolder(triggers);
    const moreGroups = groups.slice(FOLDERS_SHOWN);
    const allNames = triggers.map(t => t.name).join(", ");

    return (
        <>
            <Tooltip text={allNames}>
                {props => (
                    <span {...props} className="vc-sora-share-stack">
                        {triggers.slice(0, 3).map((t, i) => <TriggerIcon key={i} draft={t} size={44} />)}
                    </span>
                )}
            </Tooltip>
            <span className="vc-sora-share-main">
                <span className="vc-sora-share-line">
                    <Tooltip text={allNames}>
                        {props => <span {...props} className="vc-sora-share-name">{triggers.slice(0, NAMES_SHOWN).map(t => t.name).join(", ")}</span>}
                    </Tooltip>
                    {rest.length > 0 && <Plus text={`+${rest.length} more`} tip={rest.map(t => t.name).join(", ")} />}
                </span>
                <span className="vc-sora-share-tags nowrap">
                    {groups.slice(0, FOLDERS_SHOWN).map(g => <GroupTag key={g.key} g={g} />)}
                    {moreGroups.length > 0 && (
                        <Plus
                            text={`+${moreGroups.length} ${moreGroups.length === 1 ? "folder" : "folders"}`}
                            tip={moreGroups.map(g => `${g.name} (${g.items.length})`).join(", ")}
                        />
                    )}
                </span>
            </span>
        </>
    );
}

function Card({ triggers, label }: { triggers: ImportedTrigger[]; label: string; }) {
    const mine = useTriggers();
    const [done, setDone] = useState<"imported" | "updated" | null>(null);
    const [busy, setBusy] = useState(false);

    const add: ImportedTrigger[] = [];
    const update: ImportedTrigger[] = [];
    for (const t of triggers) {
        const owned = mine.find(m => m.id === t.id);
        if (!owned) add.push(t);
        else if (!sameTrigger(owned, t)) update.push(t);
    }
    const importable = [...add, ...update];
    const onlyUpdate = add.length === 0 && update.length > 0;
    const one = triggers.length === 1;

    const finish = (added: number, updated: number) => setDone(updated && !added ? "updated" : "imported");
    const pick = () => openFilePicker(importable, label, finish);
    const direct = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const added = add.length ? await importTriggers(add) : 0;
            const updated = update.length ? await updateFromFile(update) : 0;
            if (!added && !updated) return;
            showToast({ text: importSummary(added, updated), variant: "success" });
            finish(added, updated);
        } catch (e) {
            showToast({ text: `Couldn't import: ${e}`, variant: "critical" });
        } finally {
            setBusy(false);
        }
    };

    let buttons: ReactNode;
    if (done || importable.length === 0) {
        buttons = (
            <Button className="vc-sora-share-done" variant="secondary" disabled>
                <CheckIcon /> {done === "updated" ? "Updated" : done ? "Imported" : "In your list"}
            </Button>
        );
    } else {
        buttons = (
            <>
                <Tooltip text={onlyUpdate ? "Review the changes before updating" : "Choose what to import"}>
                    {props => <Button {...props} disabled={busy} onClick={pick}>{onlyUpdate ? "Update" : "Import"}</Button>}
                </Tooltip>
                <Tooltip text={onlyUpdate ? "Update your copy right away, without the import window" : "Add it right away, without the import window"}>
                    {props => <Button {...props} variant="secondary" disabled={busy} onClick={direct}>{onlyUpdate ? "Direct update" : "Direct import"}</Button>}
                </Tooltip>
            </>
        );
    }

    return (
        <div className="vc-sora-share-card">
            <div className="vc-sora-share-label">{one ? "1 trigger" : `${triggers.length} triggers`}</div>
            <InfoIcon one={one} />
            <div className="vc-sora-share-row">
                {one ? <SingleSummary trigger={triggers[0]} /> : <MultiSummary triggers={triggers} />}
            </div>
            <div className="vc-sora-share-buttons">{buttons}</div>
        </div>
    );
}

function FileCard({ url, fileName }: { url: string; fileName: string; }) {
    const [triggers, setTriggers] = useState<ImportedTrigger[] | null | undefined>(undefined);

    useEffect(() => {
        let cancelled = false;
        setTriggers(undefined);
        loadAttachment(url).then(r => { if (!cancelled) setTriggers(r); });
        return () => { cancelled = true; };
    }, [url]);

    if (triggers === undefined) return <Skeleton />;
    if (!triggers) return null;
    return <Card triggers={triggers} label={fileName} />;
}

export function ShareCardAccessory({ message }: { message: Message; }) {
    const { shareCardsInChat } = settings.use(["shareCardsInChat"]);
    const source = useMemo(() => shareSource(message), [message.content, message.attachments]);

    if (!shareCardsInChat || !source) return null;
    if (source.kind === "text") return <Card triggers={source.triggers} label={`Message from ${message.author.username}`} />;
    return <FileCard url={source.url} fileName={source.fileName} />;
}
