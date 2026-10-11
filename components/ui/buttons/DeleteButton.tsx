/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DeleteButton.css";

import { Button } from "@components/Button";
import { React, Tooltip } from "@webpack/common";

interface DeleteButtonProps {
    onClick: () => void;
    visible: boolean;
    hint?: string;
}

export function DeleteButton({ onClick, visible, hint }: DeleteButtonProps) {
    return (
        <div className={`vc-sora-deletebtn-wrapper ${visible ? "visible" : ""}`}>
            {hint ? (
                <Tooltip text={hint}>
                    {p => (
                        <Button
                            {...p}
                            variant="dangerPrimary"
                            size="iconOnly"
                            onClick={e => {
                                e.stopPropagation();
                                onClick();
                            }}
                        >
                            🗑️
                        </Button>
                    )}
                </Tooltip>
            ) : (
                <Button
                    variant="dangerPrimary"
                    size="iconOnly"
                    onClick={e => {
                        e.stopPropagation();
                        onClick();
                    }}
                >
                    🗑️
                </Button>
            )}
        </div>
    );
}

