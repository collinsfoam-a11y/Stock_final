import {
  expect,
  type APIRequestContext,
  type TestInfo,
} from "@playwright/test";

const TEST_SUPPORT_HEADER = "x-stock-verify-test-support";
const TEST_SUPPORT_HEADER_VALUE = "enabled";

let syntheticSequence = 0;

const nextSyntheticSequence = () => {
  syntheticSequence += 1;
  return syntheticSequence;
};

const sanitizeSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const truncate = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : value.slice(0, maxLength);

const buildBarcode = () =>
  `53${String((Date.now() + nextSyntheticSequence()) % 10000).padStart(4, "0")}`;

const sortStrings = (values: Set<string>) => Array.from(values).sort();

type ScopedPayload = {
  test_run_id: string;
};

type SyntheticDocument = Record<string, unknown>;

export type SyntheticErpItem = {
  barcode: string;
  category: string;
  floor: string;
  item_code: string;
  item_name: string;
  manual_barcode?: string;
  mrp: number;
  rack: string;
  sales_price?: number;
  stock_qty: number;
  subcategory: string;
  uom_name: string;
  warehouse: string;
};

export type SyntheticVariance = {
  category?: string;
  count_line_id?: string;
  floor?: string;
  item_code: string;
  item_name: string;
  rack?: string;
  session_id: string;
  subcategory?: string;
  system_qty: number;
  variance?: number;
  verified_at?: string;
  verified_by?: string;
  verified_qty: number;
  warehouse?: string;
};

export type SyntheticCleanup = ScopedPayload & {
  barcodes?: string[];
  count_line_ids?: string[];
  item_codes?: string[];
  session_ids?: string[];
  warehouse_fragments?: string[];
};

export type SyntheticInspect = SyntheticCleanup & {
  max_records?: number;
};

export type BackendInspectionState = {
  count_lines: SyntheticDocument[];
  erp_items: SyntheticDocument[];
  item_variances: SyntheticDocument[];
  latest_count_line: SyntheticDocument | null;
  latest_session: SyntheticDocument | null;
  latest_variance: SyntheticDocument | null;
  notifications: SyntheticDocument[];
  primary_erp_item: SyntheticDocument | null;
  recount_requests: SyntheticDocument[];
  session_snapshots: SyntheticDocument[];
  sessions: SyntheticDocument[];
  stock_snapshots: SyntheticDocument[];
  verification_logs: SyntheticDocument[];
};

export type BackendInspection = {
  count_line_ids: string[];
  session_ids: string[];
  state: BackendInspectionState;
  success: boolean;
  test_run_id: string;
};

export type RuntimeScopeResponse = {
  count_line_ids: string[];
  scoped: Record<string, number>;
  session_ids: string[];
  success: boolean;
  test_run_id: string;
};

export type CleanupResponse = {
  count_line_ids: string[];
  deleted: Record<string, number>;
  scoped: Record<string, number>;
  session_ids: string[];
  success: boolean;
  test_run_id: string;
};

export type FixtureScope = {
  readonly testRunId: string;
  readonly barcodes: Set<string>;
  readonly countLineIds: Set<string>;
  readonly itemCodes: Set<string>;
  readonly label: string;
  readonly sessionIds: Set<string>;
  readonly warehouseFragments: Set<string>;
};

const apiJson = async <T>(
  context: APIRequestContext,
  method: "POST" | "PATCH",
  path: string,
  data: unknown,
): Promise<T> => {
  const request =
    method === "POST"
      ? context.post(path, {
          data,
          headers: { [TEST_SUPPORT_HEADER]: TEST_SUPPORT_HEADER_VALUE },
        })
      : context.patch(path, {
          data,
          headers: { [TEST_SUPPORT_HEADER]: TEST_SUPPORT_HEADER_VALUE },
        });

  const response = await request;
  const body = await response.text();
  expect(response.ok(), `${method} ${path} failed: ${body}`).toBeTruthy();
  return JSON.parse(body) as T;
};

export const createFixtureScope = (testInfo: TestInfo): FixtureScope => {
  const slug = sanitizeSegment(`${testInfo.project.name}_${testInfo.title}`).toLowerCase();
  const testRunId = truncate(
    `testrun_${slug}_${Date.now().toString(36)}_${testInfo.retry}_${testInfo.parallelIndex}`,
    110,
  );

  return {
    testRunId,
    barcodes: new Set<string>(),
    countLineIds: new Set<string>(),
    itemCodes: new Set<string>(),
    label: slug,
    sessionIds: new Set<string>(),
    warehouseFragments: new Set<string>(),
  };
};

export const registerWarehouseFragment = (scope: FixtureScope, marker: string) => {
  if (marker.trim()) {
    scope.warehouseFragments.add(marker.trim());
  }
};

export const registerSessionId = (scope: FixtureScope, sessionId: string) => {
  if (sessionId.trim()) {
    scope.sessionIds.add(sessionId.trim());
  }
};

export const registerCountLineId = (scope: FixtureScope, countLineId: string) => {
  if (countLineId.trim()) {
    scope.countLineIds.add(countLineId.trim());
  }
};

export const registerSyntheticItem = (scope: FixtureScope, item: SyntheticErpItem) => {
  scope.itemCodes.add(item.item_code);
  scope.barcodes.add(item.barcode);
  registerWarehouseFragment(scope, item.rack);
};

export const makeSyntheticMarker = (label: string, testRunId: string) =>
  truncate(
    `E2E-${sanitizeSegment(label).toUpperCase()}-${sanitizeSegment(testRunId).toUpperCase()}`,
    80,
  );

export const makeSyntheticErpItem = (
  label: string,
  scope: FixtureScope,
  overrides: Partial<SyntheticErpItem> = {},
): SyntheticErpItem => {
  const marker = sanitizeSegment(label).toUpperCase();
  const itemCode =
    overrides.item_code ??
    truncate(
      `E2E_${marker}_${sanitizeSegment(scope.testRunId).toUpperCase()}_${nextSyntheticSequence()}`,
      96,
    );

  const item = {
    barcode: overrides.barcode ?? buildBarcode(),
    category: overrides.category ?? "E2E",
    floor: overrides.floor ?? "Showroom - Ground Floor",
    item_code: itemCode,
    item_name: overrides.item_name ?? `E2E ${marker} Item`,
    manual_barcode: overrides.manual_barcode,
    mrp: overrides.mrp ?? 10,
    rack: overrides.rack ?? makeSyntheticMarker(label, scope.testRunId),
    sales_price: overrides.sales_price ?? overrides.mrp ?? 10,
    stock_qty: overrides.stock_qty ?? 5,
    subcategory: overrides.subcategory ?? "Business",
    uom_name: overrides.uom_name ?? "PCS",
    warehouse: overrides.warehouse ?? "e2e-main",
  } satisfies SyntheticErpItem;

  registerSyntheticItem(scope, item);
  return item;
};

export const buildCleanupPayload = (scope: FixtureScope): SyntheticCleanup => ({
  barcodes: sortStrings(scope.barcodes),
  count_line_ids: sortStrings(scope.countLineIds),
  item_codes: sortStrings(scope.itemCodes),
  session_ids: sortStrings(scope.sessionIds),
  test_run_id: scope.testRunId,
  warehouse_fragments: sortStrings(scope.warehouseFragments),
});

export const createSyntheticErpItem = async (
  context: APIRequestContext,
  scope: FixtureScope,
  payload: SyntheticErpItem,
) =>
  apiJson<{ item: SyntheticErpItem; success: boolean }>(
    context,
    "POST",
    "/api/test-support/erp-items",
    {
      ...payload,
      test_run_id: scope.testRunId,
    },
  );

export const updateSyntheticErpItem = async (
  context: APIRequestContext,
  scope: FixtureScope,
  itemCode: string,
  patch: Partial<SyntheticErpItem>,
) =>
  apiJson<{ item: SyntheticErpItem; success: boolean }>(
    context,
    "PATCH",
    `/api/test-support/erp-items/${encodeURIComponent(itemCode)}`,
    {
      ...patch,
      test_run_id: scope.testRunId,
    },
  );

export const createSyntheticVariance = async (
  context: APIRequestContext,
  scope: FixtureScope,
  payload: SyntheticVariance,
) =>
  apiJson<{ success: boolean; variance: Record<string, unknown> }>(
    context,
    "POST",
    "/api/test-support/item-variances",
    {
      ...payload,
      test_run_id: scope.testRunId,
    },
  );

export const scopeRuntimeFixtures = async (
  context: APIRequestContext,
  scope: FixtureScope,
) =>
  apiJson<RuntimeScopeResponse>(
    context,
    "POST",
    "/api/test-support/scope-runtime",
    buildCleanupPayload(scope),
  );

export const cleanupSyntheticFixtures = async (
  context: APIRequestContext,
  scope: FixtureScope,
) =>
  apiJson<CleanupResponse>(
    context,
    "POST",
    "/api/test-support/cleanup",
    buildCleanupPayload(scope),
  );

export const inspectSyntheticFixtures = async (
  context: APIRequestContext,
  scope: FixtureScope,
  overrides: Partial<SyntheticInspect> = {},
) =>
  apiJson<BackendInspection>(
    context,
    "POST",
    "/api/test-support/inspect",
    {
      ...buildCleanupPayload(scope),
      ...overrides,
      test_run_id: scope.testRunId,
    },
  );

const coerceNumber = (value: unknown, label: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric backend field "${label}", received ${String(value)}`);
  }
  return parsed;
};

export const readBackendCountLineMetrics = (inspection: BackendInspection) => {
  const line = inspection.state.latest_count_line;
  if (!line) {
    throw new Error("Backend inspection did not return a latest count line");
  }
  return {
    approvalStatus: String(line.approval_status ?? ""),
    baselineHash: String(line.baseline_hash ?? ""),
    counted: coerceNumber(line.counted_qty, "counted_qty"),
    erp: coerceNumber(line.erp_qty, "erp_qty"),
    financialImpact: coerceNumber(line.financial_impact ?? 0, "financial_impact"),
    recountRequestedAt: line.recount_requested_at,
    rejectedBy: line.rejected_by,
    rejectionReason: line.rejection_reason,
    status: String(line.status ?? ""),
    variance: coerceNumber(line.variance, "variance"),
  };
};

export const readBackendVarianceMetrics = (inspection: BackendInspection) => {
  const variance = inspection.state.latest_variance;
  if (!variance) {
    throw new Error("Backend inspection did not return a latest variance");
  }
  return {
    itemCode: String(variance.item_code ?? ""),
    location: [variance.floor, variance.rack].filter(Boolean).join(" / "),
    systemQty: coerceNumber(variance.system_qty, "system_qty"),
    variance: coerceNumber(variance.variance, "variance"),
    verifiedQty: coerceNumber(variance.verified_qty, "verified_qty"),
  };
};

export const expectSingleBackendCountLine = (inspection: BackendInspection) => {
  expect(inspection.state.count_lines).toHaveLength(1);
};
