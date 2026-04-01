"use client";

const KEY = "notification-read-overrides-v1";

export function getReadOverrides(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function setReadOverride(id: string, isRead: boolean) {
  if (typeof window === "undefined") return;
  const current = getReadOverrides();
  current[id] = isRead;
  window.localStorage.setItem(KEY, JSON.stringify(current));
}

export function applyReadOverrides<T extends { id: string; is_read: boolean }>(
  items: T[],
): T[] {
  const overrides = getReadOverrides();
  return items.map((item) => {
    const override = overrides[item.id];
    if (override == null) return item;
    return { ...item, is_read: override };
  });
}
