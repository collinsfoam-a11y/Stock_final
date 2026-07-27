export type LocationType =
  | "warehouse"
  | "godown"
  | "floor"
  | "zone"
  | "rack"
  | "shelf"
  | "bin"
  | "other_area";

export interface HierarchicalLocation {
  id: string;
  name: string;
  slug: string;
  location_type: LocationType;
  parent_id?: string | null;
  code?: string | null;
  legacy_id?: string | null;
  depth: number;
  path_ids: string[];
  path_names: string[];
  active: boolean;
  version: number;
  metadata: Record<string, string>;
}

export interface LocationTreeNode extends HierarchicalLocation {
  children: LocationTreeNode[];
}
