/**
 * Metrics Redirect - Lavanya eMart
 * Routes to monitoring dashboard tab
 */

import { Redirect } from "expo-router";

export default function MetricsRedirect() {
  return (
    <Redirect
      href={{
        pathname: "/admin/dashboard-web",
        params: { tab: "monitoring" },
      }}
    />
  );
}
