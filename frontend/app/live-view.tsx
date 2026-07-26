/**
 * Live View Redirect - Lavanya eMart
 * Routes to realtime dashboard
 */

import { Redirect } from "expo-router";

export default function AdminLiveViewRedirect() {
  return <Redirect href="/admin/realtime-dashboard" />;
}
