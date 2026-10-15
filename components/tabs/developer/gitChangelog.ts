/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GitCommit } from "../../../native";
import type { ChangelogEntry, ChangelogVersion } from "../../../types";

export const UNRELEASED = "Unreleased";

// Conventional commit type -> changelog section. Types not listed are internal.
const TYPE_TO_SECTION: Record<string, string> = {
    feat: "Added",
    fix: "Fixed",
    perf: "Improved",
    refactor: "Improved",
    style: "Improved",
    revert: "Removed",
};

const SUBJECT = /^(\w+)(?:\(([^)]*)\))?!?:\s*(.+)$/;
const VERSION_TAG = /^v?(\d+\.\d+\.\d+.*)$/;
// Footers that say who wrote the commit, not what changed
const FOOTER = /^(\(generated with claude\)|co-authored-by:.*|signed-off-by:.*)$/i;

/** The version of a release tag on this commit, like 1.4.3 for v1.4.3. */
function versionOf(commit: GitCommit): string | undefined {
    for (const tag of commit.tags) {
        const m = VERSION_TAG.exec(tag);
        if (m) return m[1];
    }
}

function toEntry(commit: GitCommit, includeInternal: boolean): ChangelogEntry | null {
    const m = SUBJECT.exec(commit.subject);
    const section = m ? TYPE_TO_SECTION[m[1].toLowerCase()] : undefined;
    if (!section && !includeInternal) return null;

    const summary = m ? m[3] : commit.subject;
    const description = commit.body
        .split("\n")
        .map(l => l.trim())
        .filter(l => l && !FOOTER.test(l))
        .join("\n");

    return {
        type: section ?? "Other",
        text: summary.charAt(0).toUpperCase() + summary.slice(1),
        ...(description && { description }),
    };
}

/**
 * Turns a git log (newest first) into releases. A commit with a version tag starts its release,
 * and the commits above the newest tag form "Unreleased".
 */
export function commitsToReleases(commits: GitCommit[], includeInternal = false): ChangelogVersion[] {
    const releases: ChangelogVersion[] = [];
    let current: ChangelogVersion = { version: UNRELEASED, entries: [] };

    for (const commit of commits) {
        const version = versionOf(commit);
        if (version) {
            if (current.entries.length || current.version !== UNRELEASED) releases.push(current);
            current = { version, entries: [] };
        }
        const entry = toEntry(commit, includeInternal);
        if (entry) current.entries.push(entry);
    }
    if (current.entries.length || current.version !== UNRELEASED) releases.push(current);

    return releases;
}
