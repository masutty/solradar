/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { Paragraph } from "@components/Paragraph";
import { React } from "@webpack/common";

import { RedactField } from "../../../stores/TriggerStore";

type ExportOption = { fields: RedactField[]; label: string; };

const OPTIONS: ExportOption[] = [
    { fields: ["conditions"], label: "Strip IDs (users, channels, guilds)" },
    { fields: ["bypasses"], label: "Reset bypass flags" },
    { fields: ["webhookUrl", "webhookForwarding", "webhookPersonal"], label: "Strip webhooks" },
    { fields: ["notificationSound"], label: "Strip notification sounds" },
    { fields: ["customTriggers"], label: "Exclude custom triggers" },
    { fields: ["enabled"], label: "Export all triggers as disabled" },
];

const DEFAULT_FIELDS: RedactField[] = ["conditions", "bypasses", "webhookUrl", "webhookForwarding", "webhookPersonal", "notificationSound"];

export function PublicExportOptions({ onChange }: { onChange: (fields: Set<RedactField>) => void; }) {
    const [redactFields, setRedactFields] = React.useState<Set<RedactField>>(
        () => new Set(DEFAULT_FIELDS)
    );

    const toggle = (fields: RedactField[], checked: boolean) => {
        setRedactFields(prev => {
            const next = new Set(prev);
            fields.forEach(f => checked ? next.add(f) : next.delete(f));
            onChange(next);
            return next;
        });
    };

    return (
        // minWidth is a workaround, width: 100% did not fill the alert. May break on very small screens.
        <div style={{ minWidth: "350px", display: "flex", flexDirection: "column", gap: 2 }}>
            <Paragraph style={{ paddingBottom: 28 }}>Choose what to redact from the export:</Paragraph>
            {OPTIONS.map(({ fields, label }) => (
                <FormSwitch
                    key={fields.join(",")}
                    title={label}
                    value={fields.every(f => redactFields.has(f))}
                    onChange={checked => toggle(fields, checked)}
                    hideBorder
                />
            ))}
        </div>
    );
}
