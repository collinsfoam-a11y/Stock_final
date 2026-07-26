/**
 * Control Panel Redirect - Lavanya eMart
 * Routes to admin dashboard
 */

import { Redirect } from "expo-router";

export default function ControlPanelRedirect() {
  return <Redirect href="/admin/dashboard-web" />;
}
