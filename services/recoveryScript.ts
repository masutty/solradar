/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// No Discord or Node imports: native.ts builds the script, and it can run on its own.

const psQuote = (value: string) => `'${value.replace(/'/g, "''")}'`;

/**
 * The PowerShell that swaps Discord's IndexedDB for the one in a restore point.
 * It waits for Discord to close, renames (never deletes) the current folders, copies the snapshot's
 * folders, and starts Discord again. Every value is quoted here; none comes from the renderer.
 */
export function buildRecoveryScript(opts: { dbDir: string; snapshotDir: string; folders: string[]; discordExe: string; logPath: string; }): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        `Start-Transcript -LiteralPath ${psQuote(opts.logPath)} | Out-Null`,
        `$db = ${psQuote(opts.dbDir)}`,
        `$snap = ${psQuote(opts.snapshotDir)}`,
        `$folders = ${opts.folders.map(psQuote).join(", ")}`,
        "$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'",
        "",
        "$waited = 0",
        "while (Get-Process -Name Discord -ErrorAction SilentlyContinue) {",
        "  if ($waited -ge 60) { Write-Output 'Discord is still running, nothing was changed.'; exit 1 }",
        "  Start-Sleep -Seconds 1",
        "  $waited++",
        "}",
        "Start-Sleep -Seconds 1",
        "",
        "$moved = @()",
        "try {",
        "  foreach ($name in $folders) {",
        "    if (Test-Path -LiteralPath \"$db\\$name\") {",
        "      Rename-Item -LiteralPath \"$db\\$name\" -NewName \"$name.before-recovery-$stamp\"",
        "      $moved += $name",
        "    }",
        "  }",
        "  foreach ($name in $folders) {",
        "    if (Test-Path -LiteralPath \"$snap\\$name\") {",
        "      Copy-Item -LiteralPath \"$snap\\$name\" -Destination \"$db\\$name\" -Recurse",
        "    }",
        "  }",
        "} catch {",
        "  Write-Output \"Recovery failed: $($_.Exception.Message)\"",
        "  foreach ($name in $folders) {",
        "    if (Test-Path -LiteralPath \"$db\\$name\") { Rename-Item -LiteralPath \"$db\\$name\" -NewName \"$name.failed-recovery-$stamp\" }",
        "  }",
        "  foreach ($name in $moved) {",
        "    Rename-Item -LiteralPath \"$db\\$name.before-recovery-$stamp\" -NewName $name",
        "  }",
        "}",
        "",
        `Start-Process -FilePath ${psQuote(opts.discordExe)} -ArgumentList '--processStart', 'Discord.exe'`,
        "Stop-Transcript | Out-Null",
        "",
    ].join("\r\n");
}
