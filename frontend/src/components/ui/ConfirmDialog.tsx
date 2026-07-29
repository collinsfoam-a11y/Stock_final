import React from "react";

import { ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";

export type ConfirmDialogProps = ConfirmModalProps;

export function ConfirmDialog(props: ConfirmDialogProps) {
  return <ConfirmModal {...props} />;
}


