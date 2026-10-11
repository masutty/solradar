/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

// TODO: this is not really a store, move it to services/

// --- Types ---

export interface JoinLock {
    /** Priority of the trigger that set the lock. Lower number = more important. */
    priority: number;
    /** When the lock expires (ms timestamp). */
    lockedUntil: number;
    /** For display only. */
    triggerName: string;
    /** For display only. */
    durationSeconds: number;
}

type Listener = (lock: JoinLock | null) => void;

// --- Store ---

class JoinLockManager {
    private _lock: JoinLock | null = null;
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _listeners = new Set<Listener>();

    // --- Reading ---

    get current(): JoinLock | null {
        // Expired locks are cleared lazily on read
        if (this._lock && Date.now() >= this._lock.lockedUntil) {
            this._clearInternal();
        }
        return this._lock;
    }

    get isLocked(): boolean {
        return this.current !== null;
    }

    /** A trigger passes the lock only if it is more important (lower number) than the one that set it. */
    isBlocked(triggerPriority: number): boolean {
        const lock = this.current;
        if (!lock) return false;
        return triggerPriority >= lock.priority;
    }

    msRemaining(): number {
        if (!this._lock) return 0;
        return Math.max(0, this._lock.lockedUntil - Date.now());
    }

    // --- Mutations ---

    /** Sets the lock, or replaces it if the new trigger is more important. Returns whether it changed. */
    activate(priority: number, durationSeconds: number, triggerName: string): boolean {
        const existing = this.current;
        if (existing && priority >= existing.priority) return false;

        this._setLock({
            priority,
            lockedUntil: Date.now() + durationSeconds * 1000,
            triggerName,
            durationSeconds,
        });
        return true;
    }

    /** Removes the lock right away (manual release or invalid join). */
    release(): void {
        if (!this._lock) return;
        this._clearInternal();
        this._notify();
    }

    // --- Internals ---

    private _setLock(lock: JoinLock): void {
        if (this._timer !== null) clearTimeout(this._timer);
        this._lock = lock;
        this._timer = setTimeout(() => {
            this._clearInternal();
            this._notify();
        }, lock.lockedUntil - Date.now());
        this._notify();
    }

    private _clearInternal(): void {
        if (this._timer !== null) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this._lock = null;
    }

    // --- Observers ---

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    private _notify(): void {
        const snap = this._lock;
        this._listeners.forEach(fn => {
            try { fn(snap); } catch (e) { console.error("[JoinLockStore] Listener error:", e); }
        });
    }
}

export const JoinLockStore = new JoinLockManager();

// --- React hook ---

export function useJoinLock(): JoinLock | null {
    const [lock, setLock] = React.useState<JoinLock | null>(JoinLockStore.current);

    React.useEffect(() => {
        // The lock may have expired since the first render
        setLock(JoinLockStore.current);
        return JoinLockStore.subscribe(setLock);
    }, []);

    return lock;
}
