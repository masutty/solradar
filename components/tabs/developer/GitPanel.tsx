/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { PluginNative } from "@utils/types";
import { React, Tooltip, useEffect, useState } from "@webpack/common";

import type { GitCommit, GitInfo } from "../../../native";
import { Pill } from "../../ui/Pill";
import { card, COLORS, descriptionText } from "../../ui/styles";
import { formatTimeAgo } from "../recentJoins/components";
import { ReleaseList } from "../updates";
import { commitsToReleases, UNRELEASED } from "./gitChangelog";

const Native = VencordNative.pluginHelpers.SolRadar as PluginNative<typeof import("../../../native")>;

const mono: React.CSSProperties = { fontFamily: "var(--font-code)", fontSize: 12 };

function CommitRow({ commit, remote, here, missing }: { commit: GitCommit; remote: string; here?: boolean; missing?: boolean; }) {
    const [open, setOpen] = useState(false);
    const when = new Date(commit.date * 1000);

    return (
        <div style={{ opacity: missing ? 0.6 : 1 }}>
            <div
                onClick={() => commit.body && setOpen(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 6px", borderRadius: 6, cursor: commit.body ? "pointer" : "default", background: here ? "color-mix(in srgb, var(--brand-500) 12%, transparent)" : "none" }}
            >
                <a href={`https://github.com/${remote}/commit/${commit.hash}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...mono, color: "var(--text-link)", flexShrink: 0 }}>
                    {commit.short}
                </a>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{commit.subject}</span>
                {here && <Pill variant="brand" size="small" radius="xs">You're here</Pill>}
                {missing && <Pill variant="yellow" size="small" radius="xs">Not installed</Pill>}
                <Tooltip text={`${when.toLocaleString()} · ${commit.author}`}>
                    {props => <span {...props} style={{ ...descriptionText, flexShrink: 0 }}>{formatTimeAgo(when.getTime())}</span>}
                </Tooltip>
            </div>
            {open && <div style={{ ...descriptionText, whiteSpace: "pre-wrap", padding: "2px 6px 6px 66px" }}>{commit.body}</div>}
        </div>
    );
}

/** Which commit this install runs on, and the history around it. */
export function GitPanel() {
    const [info, setInfo] = useState<GitInfo | null>(null);
    const load = () => {
        setInfo(null);
        Native.getGitInfo().then(setInfo).catch(e => setInfo({ ok: false, error: String(e) }));
    };
    useEffect(load, []);

    if (!info) return <div style={{ ...card, ...descriptionText }}>Reading git…</div>;
    if (!info.ok) return <div style={{ ...card, ...descriptionText }}>Git is not available: {info.error}</div>;

    const upstream = info.ahead === null
        ? { text: "This branch has no upstream.", color: COLORS.muted }
        : info.missing.length
            ? { text: `${info.missing.length} commit(s) on origin you don't have.`, color: COLORS.warning }
            : { text: "Up to date with origin.", color: COLORS.positive };

    return (
        <div style={{ ...card, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Pill variant="muted" size="small" radius="xs">{info.branch}</Pill>
                <Tooltip text={info.head}>
                    {props => <span {...props} style={{ ...mono, color: COLORS.text }}>{info.describe}</span>}
                </Tooltip>
                {info.dirty && <Pill variant="yellow" size="small" radius="xs">Uncommitted changes</Pill>}
                <span style={{ flex: 1 }} />
                <span style={{ ...descriptionText, ...mono }}>{info.remote}</span>
                <Button size="min" variant="secondary" onClick={load}>Refresh</Button>
            </div>
            <span style={{ ...descriptionText, color: upstream.color }}>
                {upstream.text}
                {!!info.ahead && ` ${info.ahead} local commit(s) not on origin.`}
                {info.ahead !== null && <span style={{ color: COLORS.muted }}> As of the last fetch.</span>}
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
                {info.missing.map(c => <CommitRow key={c.hash} commit={c} remote={info.remote} missing />)}
                {info.commits.map((c, i) => <CommitRow key={c.hash} commit={c} remote={info.remote} here={i === 0} />)}
            </div>
            <span style={descriptionText}>Click a commit to read its details.</span>
        </div>
    );
}

/** The changelog the Updates tab would show if it came from git: feat, fix and friends, grouped by version tag. */
export function GitChangelog() {
    const [commits, setCommits] = useState<GitCommit[] | null>(null);
    const [internal, setInternal] = useState(false);
    useEffect(() => { Native.getGitLog().then(setCommits).catch(() => setCommits([])); }, []);

    if (!commits) return <div style={{ ...card, ...descriptionText }}>Reading git…</div>;
    if (!commits.length) return <div style={{ ...card, ...descriptionText }}>No git history to build a changelog from.</div>;

    const releases = commitsToReleases(commits, internal);
    const hasTags = commits.some(c => c.tags.length);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...descriptionText, flex: 1 }}>
                    {hasTags
                        ? "Each version tag starts a release. Commits after the newest tag are Unreleased."
                        : <>No version tags yet, so everything is Unreleased. Tag a release with <code>git tag v1.4.4</code>.</>}
                </span>
                <Button size="min" variant="secondary" onClick={() => setInternal(v => !v)}>
                    {internal ? "Hide internal commits" : "Show internal commits"}
                </Button>
            </div>
            <ReleaseList releases={releases} newVersion={null} current={releases[0]?.version ?? UNRELEASED} />
        </div>
    );
}
