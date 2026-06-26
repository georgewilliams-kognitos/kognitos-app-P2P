"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";

type DataHealth = {
  configured: boolean;
  available: boolean;
  queryError: string | null;
  tableCounts: Record<string, number | string>;
};

export function DataConnectionAlert() {
  const [health, setHealth] = useState<DataHealth | null>(null);

  useEffect(() => {
    fetch("/api/data-health")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  if (!health) return null;
  if (health.available) return null;

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="font-medium">Database is unavailable</p>
    </div>
  );
}
