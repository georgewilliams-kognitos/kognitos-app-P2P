/**
 * Barrel re-export for the API layer.
 *
 * CUSTOMIZE: Add or remove module re-exports as you add new entity APIs.
 */

export {
  listRequests,
  getRequestById,
  getDocumentsForRequest,
  getCommentsForRequest,
  getAuditEventsForRequest,
} from "./requests";

export {
  listUsers,
  getUserById,
  getUserForRole,
} from "./users";

export {
  listRules,
  getRuleById,
} from "./rules";

export {
  getNotificationsForUser,
} from "./notifications";

export {
  listVendors,
  getVendorById,
  getProductsForVendor,
  findVendorByDisplayName,
  resolveVendorByDisplayName,
  findVendorForMaterialName,
  listVendorInvoicesForVendor,
  vendorHintFromRun,
  resolveVendorForRunRow,
  isVendorResolvableRunRow,
  filterRunRowsWithResolvableVendor,
  buildHiddenVendorSummaries,
  type HiddenVendorSummary,
} from "./vendors";

export {
  getKognitosRunFromDb,
  getKognitosInsightsCacheFromDb,
  listKognitosRunRowsFromDb,
  mapVendorIdsByKognitosRunIds,
  type KognitosRunRow,
} from "@/lib/db";

export type { VendorInvoice } from "@/lib/types";
