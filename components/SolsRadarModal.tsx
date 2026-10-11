/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Heading } from "@components/Heading";
import { React } from "@webpack/common";

import { UIState } from "../stores/UIStateStore";
import { hasNewVersionAvailable, isDeveloper } from "../utils";
import { DeveloperTab } from "./tabs/developer";
import { RecentJoinsTab } from "./tabs/recentJoins";
import { SettingsTab } from "./tabs/settings";
import { StatsTab } from "./tabs/stats";
import { TriggersTab } from "./tabs/triggers";
import { UpdatesTab } from "./tabs/updates";
import { UtilsTab } from "./tabs/utils";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "./ui/LegacyModal";

// --- Tabs ---

type TabId = "recentJoins" | "triggers" | "settings" | "about" | "dev" | "stats" | "utilities" | "updates" | "testtab2" | "testtab3";

interface Tab {
    id: TabId;
    label: string;
    component: React.ComponentType;
    devOnly?: boolean;
}

const TABS: Tab[] = [
    { id: "recentJoins", label: "Snipe History", component: RecentJoinsTab },
    { id: "triggers", label: "Triggers", component: TriggersTab },
    { id: "settings", label: "Settings", component: SettingsTab },
    { id: "stats", label: "Stats", component: StatsTab },
    { id: "utilities", label: "Utilities", component: UtilsTab },
    // { id: "about", label: "About", component: AboutTab },
    { id: "updates", label: "Updates", component: UpdatesTab },
    { id: "dev", label: "Developer", component: DeveloperTab, devOnly: true },
];

const FALLBACK_TAB: TabId = "recentJoins";

function getVisibleTabs(): Tab[] {
    return TABS.filter(tab => !tab.devOnly || isDeveloper());
}

function resolveTab(tab: TabId): TabId {
    const visible = getVisibleTabs();
    return visible.some(t => t.id === tab) ? tab : FALLBACK_TAB;
}

// --- Main modal ---

interface SolsRadarModalProps {
    modalProps: ModalProps;
    initialTab?: TabId;
}
export function SolsRadarModal({ modalProps, initialTab }: SolsRadarModalProps) {
    const [activeTab, setActiveTab] = React.useState<TabId>(() =>
        resolveTab(initialTab ?? UIState.get("activeTab"))
    );
    const hasUpdate = hasNewVersionAvailable();

    const tabsRef = React.useRef<HTMLDivElement>(null);

    const visibleTabs = getVisibleTabs();
    const ActiveComponent = visibleTabs.find(t => t.id === activeTab)!.component;

    const handleTabChange = (tab: TabId) => {
        setActiveTab(tab);
        UIState.set("activeTab", tab);
    };

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader>
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    width: "100%",
                }}>
                    <Heading tag="h2">Sol Radar</Heading>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>

            <div
                ref={tabsRef}
                onWheel={e => {
                    e.preventDefault();
                    e.currentTarget.scrollLeft += e.deltaY;
                }}
                style={{
                    display: "flex",
                    gap: 2,
                    overflowX: "auto",
                    overflowY: "hidden",
                    scrollbarWidth: "none",
                    borderBottom: "1px solid var(--background-modifier-accent)",
                    flexShrink: 0,
                }}
            >
                {visibleTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        style={{
                            flexShrink: 0,

                            background: "none",
                            border: "none",

                            borderBottom: activeTab === tab.id
                                ? "2px solid var(--brand-500)"
                                : "2px solid transparent",

                            marginBottom: -1,

                            padding: "8px 14px",

                            color: activeTab === tab.id
                                ? "var(--text-default)"
                                : "var(--text-muted)",

                            fontWeight: activeTab === tab.id ? 600 : 400,
                            cursor: "pointer",
                            fontSize: 14,
                            whiteSpace: "nowrap",

                            position: "relative",
                            zIndex: 1,
                        }}
                    >
                        {tab.label}
                        {tab.id === "updates" && hasUpdate && (
                            <span
                                style={{
                                    position: "absolute",
                                    top: 6,
                                    right: 6,

                                    width: 8,
                                    height: 8,

                                    borderRadius: "50%",

                                    background: "var(--status-danger)",

                                    boxShadow: "0 0 0 2px var(--background-primary)",
                                }}
                            />
                        )}
                    </button>
                ))}
            </div>

            <ModalContent
                separator
                style={{
                    overflowX: "hidden",
                }}
            >
                <ActiveComponent />
            </ModalContent>
        </ModalRoot>
    );
}

// --- Open helper ---

export const openSolsRadarModal = (initialTab?: TabId) =>
    openModal(p => <SolsRadarModal modalProps={p} initialTab={initialTab} />);
