export interface HealthMonitorConnection {
  backendUrl: string;
}

const normalizeUrl = (url: string) => url.replace(/\/+$/, "");

export const shouldMonitorConnectionHealth = (
  connection: HealthMonitorConnection | null,
  platform: string,
  currentOrigin: string | null = null,
): boolean => {
  if (!connection) {
    return false;
  }

  if (platform !== "web") {
    return true;
  }

  if (!currentOrigin) {
    return true;
  }

  return normalizeUrl(connection.backendUrl) !== normalizeUrl(currentOrigin);
};
