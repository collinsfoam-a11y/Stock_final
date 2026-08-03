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
