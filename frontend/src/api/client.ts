import httpClient from "@/services/httpClient";
export { API_BASE_URL } from "@/services/httpClient";

/**
 * Central API client entrypoint.
 *
 * Keep this module as the single import location for HTTP calls so screens and
 * service layers do not depend on transport wiring details.
 */
export const apiClient = httpClient;

export default apiClient;
