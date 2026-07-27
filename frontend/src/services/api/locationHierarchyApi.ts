import api from "../httpClient";
import type { HierarchicalLocation, LocationTreeNode, LocationType } from "../../types/location";

export const getLocationTree = async (): Promise<LocationTreeNode[]> => {
  const response = await api.get<LocationTreeNode[]>("/api/locations/tree");
  return response.data;
};

export const resolveLocation = async (identifier: string): Promise<HierarchicalLocation> => {
  const response = await api.get<HierarchicalLocation>(
    `/api/locations/resolve/${encodeURIComponent(identifier)}`
  );
  return response.data;
};

export const createLocation = async (payload: {
  name: string;
  location_type: LocationType;
  parent_id?: string;
  code?: string;
  legacy_id?: string;
  metadata?: Record<string, string>;
  reason: string;
  change_reference: string;
}): Promise<HierarchicalLocation> => {
  const response = await api.post<HierarchicalLocation>("/api/locations", payload);
  return response.data;
};

export const locationBreadcrumb = (location: HierarchicalLocation): string =>
  location.path_names.join(" > ");
