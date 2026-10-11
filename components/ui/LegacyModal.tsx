/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as LegacyModal from "@utils/modal";
import { RenderModalProps } from "@vencord/discord-types";
import type { ComponentType, CSSProperties, ReactNode } from "react";

// Vencord types the legacy modal components as `never` to push plugins to the new <Modal>,
// but the new Modal is not available in every Discord build yet (it crashed on open).
// The legacy components still work at runtime, so this file gives them back their types.

export { closeAllModals, ModalSize, openModal } from "@utils/modal";

export type ModalProps = RenderModalProps;

type BaseProps = {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
};

export const ModalRoot = LegacyModal.ModalRoot as ComponentType<ModalProps & BaseProps & { size?: LegacyModal.ModalSize; }>;
export const ModalHeader = LegacyModal.ModalHeader as ComponentType<BaseProps & { separator?: boolean; }>;
export const ModalContent = LegacyModal.ModalContent as ComponentType<BaseProps & { separator?: boolean; }>;
export const ModalFooter = LegacyModal.ModalFooter as ComponentType<BaseProps & { separator?: boolean; }>;
export const ModalCloseButton = LegacyModal.ModalCloseButton as ComponentType<{ onClick: () => void; }>;
