export type TimePeriod =
  | "last_90_days"
  | "year_to_date"
  | "last_year"
  | "all_time";

export function getPeriodStart(period: TimePeriod, now = new Date()): Date | null {
  const d = new Date(now);
  if (period === "all_time") return null;
  if (period === "last_90_days") {
    d.setDate(d.getDate() - 90);
    return d;
  }
  if (period === "year_to_date") {
    return new Date(d.getFullYear(), 0, 1);
  }
  return new Date(d.getFullYear() - 1, 0, 1);
}

export function inSelectedPeriod(
  iso: string | undefined,
  period: TimePeriod,
): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const now = new Date();
  const start = getPeriodStart(period, now);
  if (start == null) return true;
  if (period === "last_year") {
    const end = new Date(now.getFullYear(), 0, 1);
    return t >= start.getTime() && t < end.getTime();
  }
  return t >= start.getTime() && t <= now.getTime();
}
