/**
 * Sessions domain service adapter.
 *
 * Keeps UI code bound to a domain surface instead of importing transport-layer
 * service modules directly.
 */

export {
  approveCountLine,
  createSession,
  finalizeSession,
  getAssignableStaffUsers,
  getCountLines,
  getSession,
  getWarehouses,
  getZones,
  rejectCountLine,
  unverifyStock,
  updateSessionStatus,
  verifyStock,
} from "../../services/api/api";
