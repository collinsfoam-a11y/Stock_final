/**
 * @deprecated Use `ConfirmModal` directly.
 * This alias will be removed in a future release.
 */

import React from "react";

import { ConfirmModal, type ConfirmModalProps } from "./ConfirmModal";

let _deprecatedWarned = false;

export type ConfirmDialogProps = ConfirmModalProps;

export function ConfirmDialog(props: ConfirmDialogProps) {
  if (__DEV__ && !_deprecatedWarned) {
    _deprecatedWarned = true;
    console.warn(
      "[Stock Verify] ConfirmDialog is deprecated. Use ConfirmModal directly."
    );
  }
  return <ConfirmModal {...props} />;
}

export default ConfirmDialog;