import { redirect } from "next/navigation";

/** Landing on `/` sends users to the dashboard (see `DOMAIN.navItems` + role `defaultPath`). */
export default function HomePage() {
  redirect("/dashboard");
}
