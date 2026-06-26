import type { Vendor, VendorInvoice, VendorProduct } from "@/lib/types";
import {
  getAllVendors,
  getVendorById as _getVendorById,
  getProductsForVendor as _getProductsForVendor,
  findVendorByDisplayName as _findVendorByDisplayName,
  resolveVendorByDisplayName as _resolveVendorByDisplayName,
  findVendorForMaterialName as _findVendorForMaterialName,
  listVendorInvoicesForVendor as _listVendorInvoicesForVendor,
} from "@/lib/db";

export async function listVendors(): Promise<Vendor[]> {
  return getAllVendors();
}

export async function getVendorById(id: string): Promise<Vendor | undefined> {
  return _getVendorById(id);
}

export async function getProductsForVendor(
  vendorId: string,
): Promise<VendorProduct[]> {
  return _getProductsForVendor(vendorId);
}

export async function findVendorByDisplayName(
  displayName: string,
): Promise<Vendor | null> {
  return _findVendorByDisplayName(displayName);
}

export function resolveVendorByDisplayName(
  vendors: Vendor[],
  displayName: string,
): Vendor | null {
  return _resolveVendorByDisplayName(vendors, displayName);
}

export async function findVendorForMaterialName(
  materialName: string,
): Promise<{ vendor: Vendor; product: VendorProduct } | null> {
  return _findVendorForMaterialName(materialName);
}


export {
  vendorHintFromRun,
  resolveVendorForRunRow,
  isVendorResolvableRunRow,
  filterRunRowsWithResolvableVendor,
  buildHiddenVendorSummaries,
  type HiddenVendorSummary,
} from "@/lib/vendor-resolution";

export async function listVendorInvoicesForVendor(
  vendorId: string,
): Promise<VendorInvoice[]> {
  return _listVendorInvoicesForVendor(vendorId);
}
