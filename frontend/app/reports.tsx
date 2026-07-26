/**
 * Reports Redirect - Lavanya eMart
 * Routes to reports dashboard tab
 */

import { Redirect } from "expo-router";

export default function ReportsRedirect() {
  return (
    <Redirect
      href={{
        pathname: "/admin/dashboard-web",
        params: { tab: "reports" },
      }}
    />
  );
}
