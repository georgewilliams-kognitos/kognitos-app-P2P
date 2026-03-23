"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Users, Save, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DOMAIN } from "@/lib/domain.config";

/* CUSTOMIZE: Adjust organization fields for your domain. */
export default function SettingsPage() {
  const [orgName, setOrgName] = useState("Example Organization");
  const [timezone, setTimezone] = useState("America/New_York");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your {DOMAIN.appName} configuration
        </p>
      </div>

      {/* Organization Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization
          </CardTitle>
          <CardDescription>
            Update your organization information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} className="gap-2">
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
            {saved && (
              <span className="text-sm font-medium text-emerald-600">
                Settings saved successfully!
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Navigation Cards — CUSTOMIZE: Add links to domain-specific sub-pages. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/users">
          <Card className="cursor-pointer transition-shadow hover:shadow-md">
            <CardContent className="flex items-center gap-4 px-5 py-5">
              <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-950">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold">User Management</p>
                <p className="text-sm text-muted-foreground">
                  Manage team members and roles
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
