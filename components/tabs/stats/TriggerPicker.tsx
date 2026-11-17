/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ContextMenuApi, Menu, React, Tooltip } from "@webpack/common";

import { getLayout, useFolders, useTriggers } from "../../../stores/TriggerStore";
import { TriggerIcon } from "./parts";
import { pickGroups, Selection, tickState, toggleNames } from "./pick";

function LayersIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3l9 5-9 5-9-5 9-5z" />
            <path d="M3 13l9 5 9-5" />
        </svg>
    );
}

function ChevronIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

function TickBox({ state }: { state: "on" | "part" | "off"; }) {
    return (
        <span className={`vc-sora-stats-pick-box${state === "off" ? "" : " on"}`} aria-hidden>
            {state !== "off" && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={state === "on" ? "M5 12.5l4.5 4.5L19 7.5" : "M6 12h12"} />
                </svg>
            )}
        </span>
    );
}

function PickerMenu({ initial, counts, onChange, onClose }: { initial: Selection; counts: Map<string, number>; onChange: (s: Selection) => void; onClose: () => void; }) {
    const triggers = useTriggers();
    const folders = useFolders();
    const [selection, setSelection] = React.useState<Selection>(initial);

    const groups = pickGroups(triggers, folders, getLayout());
    const allNames = triggers.map(t => t.name);
    const change = (names: string[]) => {
        const next = toggleNames(selection, names, allNames);
        setSelection(next);
        onChange(next);
    };
    const clear = () => { setSelection(null); onChange(null); };

    return (
        <Menu.Menu navId="vc-sora-stats-triggers" onClose={onClose} aria-label="Triggers">
            <Menu.MenuCheckboxItem id="vc-sora-stats-trigger-all" label="All triggers" checked={selection === null} action={clear} />
            {groups.map((g, i) => {
                const names = g.triggers.map(t => t.name);
                const items = g.triggers.map(t => (
                    <Menu.MenuCheckboxItem
                        key={t.name}
                        id={`vc-sora-stats-trigger-${g.folder?.id ?? "loose"}-${t.name}`}
                        label={(
                            <span className="vc-sora-stats-pick-row">
                                <TriggerIcon src={t.iconUrl} size={18} />
                                <span className="vc-sora-stats-pick-name">{t.name}</span>
                                <span className="vc-sora-stats-pick-count">{counts.get(t.name) ?? 0}</span>
                            </span>
                        ) as unknown as string}
                        checked={tickState(selection, [t.name]) === "on"}
                        action={() => change([t.name])}
                    />
                ));
                return (
                    <React.Fragment key={g.folder?.id ?? `loose-${i}`}>
                        <Menu.MenuSeparator />
                        {g.folder
                            ? (
                                // Hover opens the folder's triggers; a click on the folder itself ticks or unticks all of them
                                <Menu.MenuItem
                                    id={`vc-sora-stats-folder-${g.folder.id}`}
                                    label={g.folder.name}
                                    icon={() => <TickBox state={tickState(selection, names)} />}
                                    action={() => change(names)}
                                >
                                    {items}
                                </Menu.MenuItem>
                            )
                            : items}
                    </React.Fragment>
                );
            })}
        </Menu.Menu>
    );
}

function openMenu(e: React.MouseEvent, selection: Selection, counts: Map<string, number>, onChange: (s: Selection) => void) {
    const onResize = () => ContextMenuApi.closeContextMenu();
    window.addEventListener("resize", onResize);
    const onClose = () => { window.removeEventListener("resize", onResize); ContextMenuApi.closeContextMenu(); };

    ContextMenuApi.openContextMenu(e, () => <PickerMenu initial={selection} counts={counts} onChange={onChange} onClose={onClose} />);
}

/** A dropdown for which triggers and folders the whole Stats tab shows. No selection means all triggers. */
export function TriggerPicker({ selection, counts, onChange }: { selection: Selection; counts: Map<string, number>; onChange: (s: Selection) => void; }) {
    const triggers = useTriggers();
    const names = selection ? [...selection] : [];
    const icons = selection ? triggers.filter(t => selection.has(t.name)).slice(0, 3) : [];

    return (
        <Tooltip text={names.join(", ")} shouldShow={selection !== null}>
            {tipProps => (
                <button
                    {...tipProps}
                    type="button"
                    className={`vc-sora-stats-period-btn${selection ? " vc-sora-stats-pick-on" : ""}`}
                    aria-haspopup="menu"
                    onClick={e => openMenu(e, selection, counts, onChange)}
                >
                    {selection ? (
                        <>
                            <span className="vc-sora-stats-pick-stack">
                                {icons.map(t => <TriggerIcon key={t.id} src={t.iconUrl} size={16} />)}
                            </span>
                            <span className="vc-sora-stats-pick-label">{names.length === 1 ? names[0] : `${names.length} triggers`}</span>
                            <span
                                role="button"
                                aria-label="Show all triggers"
                                className="vc-sora-stats-pick-x"
                                onClick={e => { e.stopPropagation(); onChange(null); }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                                    <path d="M6 6l12 12M18 6L6 18" />
                                </svg>
                            </span>
                        </>
                    ) : (
                        <>
                            <LayersIcon />
                            <span>All triggers</span>
                            <ChevronIcon />
                        </>
                    )}
                </button>
            )}
        </Tooltip>
    );
}
