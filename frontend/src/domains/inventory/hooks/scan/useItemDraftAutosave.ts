import { useEffect } from "react";
import { useDebounce } from "use-debounce";

import { saveDraft } from "@/services/api/api";
import { createLogger } from "@/services/logging";
import { CreateCountLinePayload, Item } from "@/types/scan";
import { useSessionWebSocket } from "@/hooks/useSessionWebSocket";

const log = createLogger("useItemDraftAutosave");

export interface UseItemDraftAutosaveParams {
  currentFloor?: string | null;
  currentRack?: string | null;
  item: Item | null;
  mrp: string;
  quantity: string;
  remark: string;
  sessionId?: string;
  submitting: boolean;
}

export const useItemDraftAutosave = ({
  currentFloor,
  currentRack,
  item,
  mrp,
  quantity,
  remark,
  sessionId,
  submitting,
}: UseItemDraftAutosaveParams) => {
  const [debouncedQuantity] = useDebounce(quantity, 2000);
  const [debouncedMrp] = useDebounce(mrp, 2000);
  const [debouncedRemark] = useDebounce(remark, 2000);
  const { isConnected } = useSessionWebSocket(sessionId);

  const itemCode = item?.item_code ?? null;
  const itemName = item?.item_name || item?.name || item?.item_code || null;
  const itemMrp = item?.mrp ?? null;

  useEffect(() => {
    if (!itemCode || !sessionId || submitting || isConnected) {
      if (isConnected) {
        log.debug("Skipping HTTP autosave (WebSocket connected)");
      }
      return;
    }

    if (debouncedQuantity === "0" && !debouncedMrp && !debouncedRemark) {
      return;
    }

    const performAutosave = async () => {
      const payload: CreateCountLinePayload = {
        session_id: sessionId,
        item_code: itemCode,
        item_name: itemName || itemCode,
        counted_qty: parseFloat(debouncedQuantity) || 0,
        mrp_counted: parseFloat(debouncedMrp) || itemMrp || 0,
        remark: debouncedRemark,
        floor_no: currentFloor || null,
        rack_no: currentRack || null,
      };

      await saveDraft(payload);
    };

    void performAutosave().catch((error) => {
      log.warn("Draft autosave failed", { error: String(error) });
    });
  }, [
    currentFloor,
    currentRack,
    debouncedMrp,
    debouncedQuantity,
    debouncedRemark,
    itemCode,
    itemMrp,
    itemName,
    sessionId,
    submitting,
    isConnected,
  ]);
};
