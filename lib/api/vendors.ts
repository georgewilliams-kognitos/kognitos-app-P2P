import type { Vendor, VendorProduct } from "@/lib/types";
import {
  getAllVendors,
  getVendorById as _getVendorById,
  getProductsForVendor as _getProductsForVendor,
  findVendorByDisplayName as _findVendorByDisplayName,
  findVendorForMaterialName as _findVendorForMaterialName,
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

export async function findVendorForMaterialName(
  materialName: string,
): Promise<{ vendor: Vendor; product: VendorProduct } | null> {
  return _findVendorForMaterialName(materialName);
}
