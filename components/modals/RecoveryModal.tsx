/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { React } from "@webpack/common";

import { Logger } from "../../logger";
import { backupCounts, BackupFile, loadBackups, restoreBackup } from "../../services/BackupService";
import { Native, showToast } from "../../utils";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "../ui/LegacyModal";
import { Note } from "../ui/Note";

const logger = new Logger("SolRadar:Recovery");

type Source =
    | { kind: "backup"; id: string; date: number; hasData: boolean; backup: BackupFile; }
    | { kind: "restore"; id: string; date: number; hasData: boolean; index: number; };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const formatWhen = (ms: number) =>
    new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

async function loadSources(): Promise<Source[]> {
    const backups = await loadBackups();
    const points = typeof Native.listRestorePoints === "function" ? await Native.listRestorePoints() : [];

    const sources: Source[] = [
        ...backups.map(({ file, backup }): Source => ({
            kind: "backup", id: file, date: backup.createdAt, hasData: backupCounts(backup).triggers > 0, backup,
        })),
        ...points.map((p): Source => ({ kind: "restore", id: `restore-${p.index}`, date: p.date, hasData: p.hasData, index: p.index })),
    ];
    return sources.sort((a, b) => b.date - a.date);
}

const title: React.CSSProperties = { fontWeight: 700, fontSize: "1rem", flex: 1, color: "var(--text-default)" };

function SourceRow({ source, selected, onSelect }: { source: Source; selected: boolean; onSelect: () => void; }) {
    const counts = source.kind === "backup" ? backupCounts(source.backup) : null;
    const sub = counts
        ? `${plural(counts.triggers, "trigger")} · ${plural(counts.snipes, "snipe")}`
        : source.hasData ? "Has your data" : "No plugin data";

    return (
        <div
            onClick={onSelect}
            style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                background: "var(--background-mod-subtle)",
                border: `1px solid ${selected ? "var(--text-brand)" : "transparent"}`,
                opacity: source.hasData ? 1 : 0.6,
            }}
        >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-default)" }}>
                {source.kind === "backup" ? "Backup" : "Windows restore point"} · {formatWhen(source.date)}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>
        </div>
    );
}

export function RecoveryModal({ modalProps }: { modalProps: ModalProps; }) {
    const [sources, setSources] = React.useState<Source[] | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        loadSources().then(list => {
            setSources(list);
            setSelectedId(list.find(s => s.hasData)?.id ?? null);
        }).catch(err => {
            logger.error("Failed to look for backups:", err);
            setError(err instanceof Error ? err.message : String(err));
        });
    }, []);

    const selected = sources?.find(s => s.id === selectedId) ?? null;

    const restore = async () => {
        if (!selected) return;
        setBusy(true);
        try {
            if (selected.kind === "backup") {
                await restoreBackup(selected.backup);
            } else {
                const result = await Native.restoreFromRestorePoint(selected.index);
                if (!result.ok) throw new Error(result.error);
            }
        } catch (err) {
            logger.error("Restore failed:", err);
            showToast({ text: `Couldn't restore: ${err instanceof Error ? err.message : String(err)}`, variant: "critical" });
            setBusy(false);
        }
    };

    const confirmText = selected?.kind === "restore"
        ? `Discord will close and reopen with its local data from ${formatWhen(selected.date)}. Other plugins' data goes back too, and you may need to log in again.`
        : "Replace your triggers, folders and snipes with this backup? Your current data is backed up first.";

    return (
        <ModalRoot {...modalProps} size={ModalSize.SMALL}>
            <ModalHeader>
                <span style={title}>Recover lost data</span>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>
            <Divider />
            <ModalContent style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {error && <Note variant="danger">{error}</Note>}
                {!error && !sources && <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Looking…</span>}
                {sources?.length === 0 && <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>No backups or restore points found</span>}
                {confirming
                    ? <Note variant="warning">{confirmText}</Note>
                    : sources?.map(s => <SourceRow key={s.id} source={s} selected={s.id === selectedId} onSelect={() => setSelectedId(s.id)} />)}
            </ModalContent>
            <ModalFooter>
                <div style={{ flex: 1 }} />
                {confirming ? (
                    <>
                        <Button size="small" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
                        <Button size="small" variant="dangerPrimary" disabled={busy} onClick={restore}>Restore</Button>
                    </>
                ) : (
                    <Button size="small" variant="dangerPrimary" disabled={!selected} onClick={() => setConfirming(true)}>Restore</Button>
                )}
            </ModalFooter>
        </ModalRoot>
    );
}

export function openRecoveryModal() {
    openModal(p => <RecoveryModal modalProps={p} />);
}
