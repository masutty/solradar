/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { PluginSettingComponentProps } from "@utils/types";
import { React } from "@webpack/common";

import { openSolsRadarModal } from "../../SolsRadarModal";

export function OpenPluginButton(_props: PluginSettingComponentProps) {
    return (
        <Button onClick={() => openSolsRadarModal()}>
            Open SolRadar Settings
        </Button>
    );
}
