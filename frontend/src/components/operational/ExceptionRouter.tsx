/**
 * ExceptionRouter — typed journey router for backend exception codes (P0C).
 *
 * Driven by stable machine-readable backend codes (never message-string parsing).
 * Each {@link ExceptionViewModel.action.journey} maps to a canonical UI target:
 *   OPEN_DRAFT / OPEN_EXISTING_COUNT / RELOCATION / BATCH_PICKER / MRP_PICKER
 *   / CAPTURE_MRP / UNKNOWN_ITEM / SHOW_SERIAL / ESCALATE / READ_ONLY
 *   / REASSIGN / COMPARE_SYNC / DISMISS
 *
 * The router never invents journeys; unrecognised codes fall through to a
 * generic "dismiss" safe state.
 */

import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";

import { ExceptionCard } from "./ExceptionCard";
import type { ExceptionViewModel } from "../../viewModels/types";

interface ExceptionRouterProps {
  exceptions: ExceptionViewModel[];
}

export const ExceptionRouter: React.FC<ExceptionRouterProps> = ({ exceptions }) => {
  const router = useRouter();

  if (exceptions.length === 0) return null;

  const handleAction = (vm: ExceptionViewModel) => {
    const journey = vm.action?.journey;
    if (!journey) return;

    switch (journey) {
      case "OPEN_DRAFT":
        if (vm.entityId) router.push(`/staff/draft/${vm.entityId}`);
        break;
      case "OPEN_EXISTING_COUNT":
        if (vm.entityId) router.push(`/staff/session/${vm.entityId}`);
        break;
      case "RELOCATION":
        router.push("/staff/relocation");
        break;
      case "BATCH_PICKER":
        router.push("/staff/batch-picker");
        break;
      case "MRP_PICKER":
        router.push("/staff/mrp-picker");
        break;
      case "CAPTURE_MRP":
        router.push("/staff/capture-mrp");
        break;
      case "UNKNOWN_ITEM":
        router.push("/staff/unknown-item");
        break;
      case "SHOW_SERIAL":
        if (vm.entityId) router.push(`/staff/serial/${vm.entityId}`);
        break;
      case "ESCALATE":
        router.push("/supervisor/escalate");
        break;
      case "READ_ONLY":
        router.push("/supervisor/audit-trail");
        break;
      case "REASSIGN":
        router.push("/supervisor/reassign");
        break;
      case "COMPARE_SYNC":
        if (vm.entityId) router.push(`/supervisor/sync-compare/${vm.entityId}`);
        break;
      case "DISMISS":
      default:
        break;
    }
  };

  return (
    <View style={{ gap: 12 }}>
      {exceptions.map((vm, i) => (
        <ExceptionCard key={`${vm.code}-${i}`} vm={vm} onAction={handleAction} />
      ))}
    </View>
  );
};
