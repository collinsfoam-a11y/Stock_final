import apiClient, { refreshAccessTokenDeduped } from "./httpClient";
import { useAuthStore } from "../store/authStore";
import { secureStorage } from "./storage/secureStorage";
import { Platform } from "react-native";
import { createLogger } from "./logging";

const TOKEN_STORAGE_KEY = "auth_token";
const REFRESH_TOKEN_STORAGE_KEY = "refresh_token";
const log = createLogger("authService");

/**
 * Authentication service for handling token management and user state.
 * This service acts as a bridge between the Zustand auth store and the API.
 */
export const authService = {
  /**
   * Get the current access token from secure storage.
   */
  async getAccessToken(): Promise<string | null> {
    return await secureStorage.getItem(TOKEN_STORAGE_KEY);
  },

  /**
   * Get the current refresh token from secure storage.
   */
  async getRefreshToken(): Promise<string | null> {
    return await secureStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  },

  /**
   * Refresh the access token using the refresh token.
   *
   * Delegates to the httpClient refresh singleton so this path and the
   * 401-interceptor share one in-flight refresh promise. Previously this
   * method ran its own refresh with divergent storage/header writes, racing
   * the interceptor and randomly invalidating tokens (audit C5).
   */
  async refreshToken(): Promise<string | null> {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken && Platform.OS !== "web") {
      log.warn("No refresh token available");
      return null;
    }
    return refreshAccessTokenDeduped();
  },

  /**
   * Get the current user from the auth store.
   */
  getCurrentUser() {
    return useAuthStore.getState().user;
  },

  /**
   * Check if the user is currently authenticated.
   */
  isAuthenticated(): boolean {
    return useAuthStore.getState().isAuthenticated;
  },

  /**
   * Logout the user and clear all stored data.
   */
  async logout(): Promise<void> {
    await useAuthStore.getState().logout();
    await secureStorage.removeItem(TOKEN_STORAGE_KEY);
    await secureStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  },
};
