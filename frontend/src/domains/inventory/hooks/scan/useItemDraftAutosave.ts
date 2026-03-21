import { useEffect } from "react";
import { useDebounce } from "use-debounce";

import { saveDraft } from "@/services/api/api";
import { CreateCountLinePayload, Item } from "@/types/scan";

interface UseItemDraftAutosaveParams {
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
  const [debouncedFormData] = useDebounce(
    {
      quantity,
      mrp,
      remark,
    },
    2000,
  );

  useEffect(() => {
    if (!item || !sessionId || quantity === "0" || submitting) {
      return;
    }

    const performAutosave = async () => {
      const payload: CreateCountLinePayload = {
        session_id: sessionId,
        item_code: item.item_code,
        item_name: item.item_name || item.name || item.item_code,
        counted_qty: parseFloat(quantity) || 0,
        mrp_counted: parseFloat(mrp) || item.mrp,
        remark,
        floor_no: currentFloor || null,
        rack_no: currentRack || null,
      };

      await saveDraft(payload);
    };

    performAutosave();
  }, [
    currentFloor,
    currentRack,
    debouncedFormData,
    item,
    mrp,
    quantity,
    remark,
    sessionId,
    submitting,
  ]);
};
