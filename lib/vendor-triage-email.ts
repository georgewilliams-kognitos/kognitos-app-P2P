import type { Vendor } from "@/lib/types";
import type { TriageAlert, TriageCheckKey } from "@/lib/p2p-triage";

/** Long-form guidance for vendor detail banner (includes contact name and email when available). */
export function getVendorActionDetailLine(
  checkKey: TriageCheckKey,
  vendor: Vendor,
): string {
  const name = vendor.primary_contact_name?.trim();
  const email = vendor.primary_contact_email?.trim();
  const contact =
    name && email
      ? `${name} (${email})`
      : name
        ? name
        : email
          ? email
          : "the primary vendor contact on file";

  switch (checkKey) {
    case "documentMatch":
      return `Contact ${contact} to align purchase order, goods receipt, and supplier invoice references, and confirm the PO number on the invoice matches authorized purchase documentation.`;
    case "quantityAndUnitMatch":
      return `Coordinate with internal logistics and receiving to verify counted quantities and units of measure; engage ${contact} if the invoice line quantity does not match shipment or receipt records.`;
    case "valueMatch":
      return `Contact ${contact} to validate the invoice total against the active price list or contract, and obtain corrected pricing documentation or a revised invoice if required.`;
    case "coaValidation":
      return `Contact ${contact} to review certificate of analysis details and confirm purity and specification parameters meet the purchase requirements.`;
    default:
      return "";
  }
}

function checkNoun(key: TriageCheckKey): string {
  switch (key) {
    case "documentMatch":
      return "document match (PO / invoice / receipt alignment)";
    case "quantityAndUnitMatch":
      return "quantity and unit-of-measure match";
    case "valueMatch":
      return "invoice value / pricing match";
    case "coaValidation":
      return "certificate of analysis (COA) validation";
    default:
      return "validation check";
  }
}

/**
 * One email per validation type, listing every invoice line (ID, date, total, PO, material, qty).
 */
export function buildVendorTriageConsolidatedDraftEmail(
  alerts: TriageAlert[],
  vendor: Vendor,
  checkKey: TriageCheckKey,
): { to: string; subject: string; body: string } {
  const to = vendor.primary_contact_email?.trim() ?? "";
  const greetName = vendor.primary_contact_name?.trim() ?? "Team";
  const company = vendor.company_name;

  if (alerts.length === 0) {
    return { to, subject: "", body: "" };
  }

  const label = alerts[0].checkLabel;
  const noun = checkNoun(checkKey);
  const count = alerts.length;

  const subject =
    count === 1
      ? `Invoice ${alerts[0].invoiceNumber} — ${label} review requested (${company})`
      : `${count} invoices — ${label} review requested (${company})`;

  const lines: string[] = [
    `Dear ${greetName},`,
    ``,
    `We are following up on our Procure-to-Pay validation for ${company}. The automated review did not approve payment because the ${noun} did not pass for the following invoice(s):`,
    ``,
  ];

  alerts.forEach((alert, i) => {
    lines.push(`---`);
    lines.push(`Invoice ${i + 1} of ${count}`);
    lines.push(`— Invoice ID: ${alert.invoiceNumber}`);
    lines.push(`— Invoice date: ${alert.invoiceDateText}`);
    lines.push(`— Invoice total: ${alert.totalInvoiceValueText}`);
    lines.push(`— Purchase order (reference): ${alert.poNumber}`);
    lines.push(`— Material / item: ${alert.materialName}`);
    lines.push(`— Quantity purchased (as stated): ${alert.quantityText}`);
    lines.push(``);
  });

  lines.push(
    `Please review each invoice above and confirm whether the information is accurate, or provide corrected documentation so we can release payment.`,
    ``,
    `Thank you,`,
    `Accounts Payable`,
  );

  return { to, subject, body: lines.join("\n") };
}

/** Single-invoice draft (delegates to consolidated). */
export function buildVendorTriageDraftEmail(
  alert: TriageAlert,
  vendor: Vendor,
): { to: string; subject: string; body: string } {
  return buildVendorTriageConsolidatedDraftEmail([alert], vendor, alert.checkKey);
}

/**
 * One draft per invoice row: one failed check uses {@link buildVendorTriageDraftEmail};
 * multiple failed checks on the same run are combined into a single message.
 */
export function buildVendorInvoiceRowDraftEmail(
  alerts: TriageAlert[],
  vendor: Vendor,
): { to: string; subject: string; body: string } {
  const to = vendor.primary_contact_email?.trim() ?? "";
  const greetName = vendor.primary_contact_name?.trim() ?? "Team";
  const company = vendor.company_name;

  if (alerts.length === 0) {
    return { to, subject: "", body: "" };
  }

  if (alerts.length === 1) {
    return buildVendorTriageDraftEmail(alerts[0], vendor);
  }

  const inv = alerts[0].invoiceNumber;
  const subject = `Invoice ${inv} — ${alerts.length} validation items review requested (${company})`;

  const lines: string[] = [
    `Dear ${greetName},`,
    ``,
    `We are following up on our Procure-to-Pay validation for ${company}. The automated review did not approve payment because the following checks did not pass for invoice ${inv}:`,
    ``,
  ];

  for (const alert of alerts) {
    lines.push(`---`);
    lines.push(alert.checkLabel);
    lines.push(`— Invoice ID: ${alert.invoiceNumber}`);
    lines.push(`— Invoice date: ${alert.invoiceDateText}`);
    lines.push(`— Invoice total: ${alert.totalInvoiceValueText}`);
    lines.push(`— Purchase order (reference): ${alert.poNumber}`);
    lines.push(`— Material / item: ${alert.materialName}`);
    lines.push(`— Quantity purchased (as stated): ${alert.quantityText}`);
    lines.push(``);
  }

  lines.push(
    `Please review each item above and confirm whether the information is accurate, or provide corrected documentation so we can release payment.`,
    ``,
    `Thank you,`,
    `Accounts Payable`,
  );

  return { to, subject, body: lines.join("\n") };
}
