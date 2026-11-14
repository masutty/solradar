/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, TextButton } from "@components/Button";
import { Heading } from "@components/Heading";
import { CloudUploadIcon, CopyIcon, DeleteIcon, EyeIcon, FolderIcon as FileIcon, PencilIcon, UploadIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { Switch } from "@components/Switch";
import { Alerts, ContextMenuApi, Menu, React, showToast, TextArea, TextInput, Tooltip, useRef, useState } from "@webpack/common";

import {
    createFolder,
    deleteFolder,
    FOLDER_COLORS,
    FOLDER_DESC_MAX,
    FOLDER_NAME_MAX,
    getTriggers,
    moveTrigger,
    TriggerFolder,
    updateFolder,
} from "../../../stores/TriggerStore";
import { isDeveloper } from "../../../utils";
import { HeaderActions } from "../../tour/ReplayTourButton";
import { tourAnchor } from "../../tour/TourAnchor";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../../ui/LegacyModal";
import { copyFolderToClipboard, exportFolderToFile, openSafeExportDialogForFolder } from "./exportActions";

// --- Icons ---

export function FolderGlyph({ size = 18 }: { size?: number; }) {
    return (
        <svg className="vc-sora-folder-glyph" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6c.6 0 1.2.25 1.6.7L12 6h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg className="vc-sora-folder-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

// Same shape as the built-in menu icons, so the menu can pass its props to the svg
function EyeOffIcon({ width = 24, height = 24, ...svgProps }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg {...svgProps} width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6C3.7 8.5 2 12 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
            <path d="M14.1 14.2a3 3 0 1 1-4.2-4.2" />
            <path d="m2 2 20 20" />
        </svg>
    );
}

function PauseIcon({ width = 24, height = 24, ...svgProps }: React.SVGProps<SVGSVGElement>) {
    return (
        <svg {...svgProps} width={width} height={height} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
    );
}

function PlayIcon({ width = 24, height = 24 }: { width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
        </svg>
    );
}

// --- Text that shows itself in a tooltip only when it is cut ---

function TruncatedText({ text, className }: { text: string; className: string; }) {
    const [cut, setCut] = useState(false);
    return (
        <Tooltip text={text} shouldShow={cut}>
            {props => (
                <span
                    {...props}
                    className={className}
                    onMouseEnter={e => {
                        setCut(e.currentTarget.scrollWidth > e.currentTarget.clientWidth);
                        props.onMouseEnter();
                    }}
                >
                    {text}
                </span>
            )}
        </Tooltip>
    );
}

// --- Header ---

export interface FolderCount { on: number; total: number; }

const DRAG_THRESHOLD_PX = 5;

export function FolderHeader({ folder, count, open, preview, tourId, alwaysShowCount, isDragging, isDropTarget, canDrag, onToggle, onDragStart }: {
    folder: TriggerFolder;
    tourId?: string;
    /** The count stays visible instead of showing on hover */
    alwaysShowCount?: boolean;
    count: FolderCount;
    open: boolean;
    /** Drawn inside the editor: no clicks, no menu */
    preview?: boolean;
    isDragging?: boolean;
    isDropTarget?: boolean;
    canDrag?: boolean;
    onToggle?: () => void;
    onDragStart?: (e: React.PointerEvent, rect: DOMRect) => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const pressRef = useRef<{ x: number; y: number; } | null>(null);
    const draggedRef = useRef(false);
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    const countTip = `${count.on} of ${count.total} triggers in this folder are on${folder.paused ? ", but the folder is paused" : ""}`;
    const countChip = (
        <Tooltip text={countTip}>
            {props => <span {...props} className="vc-sora-folder-count"><b>{count.on}</b>/{count.total}</span>}
        </Tooltip>
    );

    return (
        <div
            ref={ref}
            {...tourAnchor(tourId)}
            data-folder-header={preview ? undefined : folder.id}
            className={`vc-sora-folder-head${open ? "" : " closed"}${alwaysShowCount ? " count-always" : ""}${folder.paused ? " paused" : ""}${preview ? " preview" : ""}${isDragging ? " dragging" : ""}${isDropTarget ? " drop" : ""}`}
            style={{ "--sora-fc": folder.color } as React.CSSProperties}
            onPointerDown={e => {
                draggedRef.current = false;
                if (preview || !canDrag || e.button !== 0 || (e.target as HTMLElement).closest("button, [role=switch], input")) return;
                pressRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerMove={e => {
                const press = pressRef.current;
                if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
                pressRef.current = null;
                draggedRef.current = true;
                if (ref.current) onDragStart?.(e, ref.current.getBoundingClientRect());
            }}
            onPointerUp={() => { pressRef.current = null; }}
            onPointerLeave={() => { pressRef.current = null; }}
            onClick={() => {
                if (draggedRef.current) draggedRef.current = false;
                else onToggle?.();
            }}
            onContextMenu={e => {
                if (preview) return;
                e.preventDefault();
                openFolderContextMenu(e, folder);
            }}
        >
            <ChevronIcon />
            <FolderGlyph />
            {/* Always shown, the count sits before the name; on hover, it slides open after it */}
            {alwaysShowCount && countChip}
            <TruncatedText text={folder.name} className="vc-sora-folder-name" />
            {!alwaysShowCount && countChip}
            {folder.hidden && (
                <Tooltip text="Hidden from the list. Right-click and choose Unhide to bring it back.">
                    {props => <span {...props} className="vc-sora-trigger-offtag">Hidden</span>}
                </Tooltip>
            )}
            <TruncatedText text={folder.description} className="vc-sora-folder-desc" />
            {!preview && (
                <Tooltip text="Edit folder">
                    {props => (
                        <button {...props} type="button" className="vc-sora-folder-edit" aria-label="Edit folder" onClick={e => { stop(e); openFolderEditor(folder); }}>
                            <PencilIcon width={15} height={15} />
                        </button>
                    )}
                </Tooltip>
            )}
            {/* Paused, it stays visible as the paused mark. On, it only shows on hover. */}
            {!preview && (
                <Tooltip text={folder.paused ? "Paused, its triggers don't run. Click to turn it back on." : "Pause folder"}>
                    {props => (
                        <button
                            {...props}
                            {...tourAnchor(tourId ? "triggers.folderPause" : undefined)}
                            type="button"
                            className={`vc-sora-folder-pausebtn${folder.paused ? " paused" : ""}`}
                            aria-label={folder.paused ? "Turn folder on" : "Pause folder"}
                            onClick={e => { stop(e); updateFolder(folder.id, { paused: !folder.paused }); }}
                        >
                            {folder.paused ? <PlayIcon width={14} height={14} /> : <PauseIcon width={14} height={14} />}
                        </button>
                    )}
                </Tooltip>
            )}
            {preview && folder.paused && (
                <span className="vc-sora-folder-pausebtn paused"><PauseIcon width={14} height={14} /></span>
            )}
        </div>
    );
}

// --- Tag in the import picker ---

export function FolderTag({ name, color, tooltip }: { name: string; color: string; tooltip: string; }) {
    return (
        <Tooltip text={tooltip}>
            {props => (
                <span {...props} className="vc-sora-folder-tag" style={{ "--sora-fc": color } as React.CSSProperties}>
                    <FolderGlyph size={11} />
                    <span>{name}</span>
                </span>
            )}
        </Tooltip>
    );
}

// --- Context menu ---

export function openFolderContextMenu(e: React.MouseEvent, folder: TriggerFolder): void {
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-sora-folder-context-menu" onClose={ContextMenuApi.closeContextMenu} aria-label="Folder options">
            <Menu.MenuItem
                id="vc-sora-folder-edit"
                label="Edit folder"
                leadingAccessory={{ type: "icon", icon: PencilIcon }}
                action={() => openFolderEditor(folder)}
            />
            <Menu.MenuItem
                id="vc-sora-folder-pause"
                label={folder.paused ? "Turn on" : "Pause"}
                leadingAccessory={{ type: "icon", icon: PauseIcon }}
                action={() => updateFolder(folder.id, { paused: !folder.paused })}
            />
            <Menu.MenuItem
                id="vc-sora-folder-hide"
                label={folder.hidden ? "Unhide" : "Hide from list"}
                leadingAccessory={{ type: "icon", icon: folder.hidden ? EyeIcon : EyeOffIcon }}
                action={() => updateFolder(folder.id, { hidden: !folder.hidden })}
            />
            <Menu.MenuSeparator />
            <Menu.MenuItem id="vc-sora-folder-export" label="Export" leadingAccessory={{ type: "icon", icon: UploadIcon }}>
                <Menu.MenuItem
                    id="vc-sora-folder-export-file"
                    label="To file..."
                    leadingAccessory={{ type: "icon", icon: FileIcon }}
                    action={() => exportFolderToFile(folder)}
                />
                <Menu.MenuItem
                    id="vc-sora-folder-export-clipboard"
                    label="To clipboard"
                    leadingAccessory={{ type: "icon", icon: CopyIcon }}
                    action={() => copyFolderToClipboard(folder)}
                />
                {isDeveloper() && (
                    <Menu.MenuItem
                        id="vc-sora-folder-export-safe"
                        label="To file (safe)..."
                        leadingAccessory={{ type: "icon", icon: CloudUploadIcon }}
                        action={() => openSafeExportDialogForFolder(folder)}
                    />
                )}
            </Menu.MenuItem>
            <Menu.MenuSeparator />
            <Menu.MenuItem
                id="vc-sora-folder-delete"
                label="Delete folder"
                color="danger"
                leadingAccessory={{ type: "icon", icon: DeleteIcon }}
                action={() => confirmDeleteFolder(folder)}
            />
        </Menu.Menu>
    ));
}

const plural = (n: number) => `${n} trigger${n === 1 ? "" : "s"}`;

export function confirmDeleteFolder(folder: TriggerFolder, onDone?: () => void): void {
    const n = getTriggers().filter(t => t.folderId === folder.id).length;
    const done = (withTriggers: boolean) => async () => {
        await deleteFolder(folder.id, withTriggers);
        showToast({ text: withTriggers ? `Deleted the folder and ${plural(n)}.` : "Folder deleted." });
        onDone?.();
    };

    Alerts.show({
        title: `Delete ${folder.name}?`,
        body: (
            <Paragraph>
                {n ? `Its ${plural(n)} move to the top of the list, out of any folder. You can also delete them with it.` : "The folder is empty."}
            </Paragraph>
        ),
        confirmText: "Delete folder",
        cancelText: "Cancel",
        onConfirm: done(false),
        ...(n && {
            secondaryConfirmText: `Delete with ${plural(n)}`,
            onConfirmSecondary: done(true),
        }),
    });
}

// --- Editor ---

type Draft = Omit<TriggerFolder, "id">;

function FolderEditor({ modalProps, folder, forTrigger }: { modalProps: ModalProps; folder?: TriggerFolder; forTrigger?: string; }) {
    const [draft, setDraft] = useState<Draft>(() => folder
        ? { name: folder.name, description: folder.description, color: folder.color, hidden: folder.hidden, paused: folder.paused, collapsed: folder.collapsed }
        : { name: "", description: "", color: FOLDER_COLORS[0] });
    const set = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));
    const count = folder
        ? (() => { const ts = getTriggers().filter(t => t.folderId === folder.id && !t.hidden); return { on: ts.filter(t => t.state.enabled).length, total: ts.length }; })()
        : { on: 0, total: 0 };

    const save = async () => {
        const data = { ...draft, name: draft.name.trim() || "Untitled folder", description: draft.description.trim() };
        if (folder) await updateFolder(folder.id, data);
        else {
            const created = await createFolder(data);
            if (forTrigger) await moveTrigger(forTrigger, created.id);
        }
        modalProps.onClose();
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader className="vc-sora-modal-header vc-sora-modal-header-tall">
                <div className="vc-sora-folder-editor-head">
                    <Heading tag="h2" className="vc-sora-modal-title" style={{ margin: 0 }}>{folder ? "Edit folder" : "New folder"}</Heading>
                    <HeaderActions onClose={modalProps.onClose} />
                </div>
            </ModalHeader>

            <ModalContent>
                <div
                    className="vc-sora-folder-editor"
                    onKeyDown={e => {
                        if (e.key !== "Enter" || e.shiftKey || (e.target as HTMLElement).tagName === "BUTTON") return;
                        e.preventDefault();
                        save();
                    }}
                >
                    <FolderHeader folder={{ id: "preview", ...draft, name: draft.name || "Untitled folder" }} count={count} open preview />

                    <div className="vc-sora-folder-field">
                        <div className="vc-sora-folder-label"><span>Name</span><span className="vc-sora-folder-limit">{draft.name.length}/{FOLDER_NAME_MAX}</span></div>
                        <TextInput value={draft.name} onChange={v => set({ name: v.slice(0, FOLDER_NAME_MAX) })} maxLength={FOLDER_NAME_MAX} placeholder="Rare biomes" autoFocus />
                    </div>

                    <div className="vc-sora-folder-field">
                        <div className="vc-sora-folder-label"><span>Description</span><span className="vc-sora-folder-limit">{draft.description.length}/{FOLDER_DESC_MAX}</span></div>
                        <TextArea value={draft.description} onChange={v => set({ description: v.replace(/\n/g, " ").slice(0, FOLDER_DESC_MAX) })} maxLength={FOLDER_DESC_MAX} rows={2} placeholder="Optional" />
                    </div>

                    <div className="vc-sora-folder-field">
                        <div className="vc-sora-folder-label"><span>Color</span></div>
                        <div className="vc-sora-folder-swatches">
                            {FOLDER_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    className="vc-sora-folder-swatch"
                                    aria-label={c}
                                    aria-pressed={draft.color === c}
                                    style={{ "--sora-c": c } as React.CSSProperties}
                                    onClick={() => set({ color: c })}
                                />
                            ))}
                            <Tooltip text="Custom color">
                                {props => (
                                    <label {...props} className={`vc-sora-folder-swatch custom${FOLDER_COLORS.includes(draft.color) ? "" : " on"}`}>
                                        <input type="color" value={draft.color} onChange={e => set({ color: e.currentTarget.value })} />
                                    </label>
                                )}
                            </Tooltip>
                        </div>
                    </div>

                    <div className="vc-sora-folder-switches">
                        <div className="vc-sora-folder-hiderow">
                            <span>Pause folder</span>
                            <Switch checked={!!draft.paused} onChange={v => set({ paused: v })} />
                        </div>
                        <div className="vc-sora-folder-hiderow">
                            <span>Hide from list</span>
                            <Switch checked={!!draft.hidden} onChange={v => set({ hidden: v })} />
                        </div>
                    </div>
                </div>
            </ModalContent>

            <ModalFooter className="vc-sora-modal-footer">
                <div className="vc-sora-folder-editor-foot">
                    {folder && <TextButton variant="danger" onClick={() => confirmDeleteFolder(folder, modalProps.onClose)}>Delete folder</TextButton>}
                    <span style={{ flex: 1 }} />
                    <Button size="small" variant="secondary" onClick={modalProps.onClose}>Cancel</Button>
                    <Button size="small" variant="primary" onClick={save}>{folder ? "Save" : "Create"}</Button>
                </div>
            </ModalFooter>
        </ModalRoot>
    );
}

/** Opens the folder editor. Without a folder it creates one, and `forTrigger` then moves that trigger into it. */
export function openFolderEditor(folder?: TriggerFolder, forTrigger?: string): void {
    openModal(p => <FolderEditor modalProps={p} folder={folder} forTrigger={forTrigger} />);
}
