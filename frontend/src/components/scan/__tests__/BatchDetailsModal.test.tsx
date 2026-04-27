import React from "react";
import { render, waitFor } from "@testing-library/react-native";

import { BatchDetailsModal } from "../BatchDetailsModal";
import apiClient from "../../../services/httpClient";

jest.mock("../../../services/httpClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("BatchDetailsModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads batches through the shared API client with an encoded item code", async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        batches: [],
      },
    });

    render(
      <BatchDetailsModal
        visible={true}
        item={{
          item_code: "ITEM/001",
          item_name: "Soap Bar",
        }}
        onClose={jest.fn()}
        onBatchSelect={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith(
        "/api/item-batches/ITEM%2F001",
      );
    });
  });
});
