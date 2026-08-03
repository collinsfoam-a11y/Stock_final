import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthService {
  getAccessToken(): Promise<string | null>;
  getRefreshToken(): Promise<string | null>;
  setTokens(tokens: TokenPair): Promise<void>;
  clearTokens(): Promise<void>;
  refreshAccessToken(): Promise<string | null>;
  isAuthenticated(): Promise<boolean>;
  attachAuthHeaders(config: AxiosRequestConfig): Promise<AxiosRequestConfig>;
  createAuthInterceptor?: (axiosInstance: AxiosInstance) => void;
}

class AuthServiceImpl implements AuthService {
  private refreshTokenPromise: Promise<string | null> | null = null;
  private readonly TOKEN_KEYS = {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
  };

  // Separate client for refresh operations to avoid interceptor recursion
  private refreshClient: AxiosInstance;

  constructor() {
    this.refreshClient = axios.create({
      baseURL: process.env.EXPO_PUBLIC_API_BASE_URL || '/api',
      timeout: 10000,
    });
  }

  async getAccessToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(this.TOKEN_KEYS.ACCESS_TOKEN);
    } else {
      return await SecureStore.getItemAsync(this.TOKEN_KEYS.ACCESS_TOKEN);
    }
  }

  async getRefreshToken(): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(this.TOKEN_KEYS.REFRESH_TOKEN);
    } else {
      return await SecureStore.getItemAsync(this.TOKEN_KEYS.REFRESH_TOKEN);
    }
  }

  async setTokens(tokens: TokenPair): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(this.TOKEN_KEYS.ACCESS_TOKEN, tokens.accessToken);
      localStorage.setItem(this.TOKEN_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    } else {
      await SecureStore.setItemAsync(this.TOKEN_KEYS.ACCESS_TOKEN, tokens.accessToken);
      await SecureStore.setItemAsync(this.TOKEN_KEYS.REFRESH_TOKEN, tokens.refreshToken);
    }
  }

  async clearTokens(): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(this.TOKEN_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(this.TOKEN_KEYS.REFRESH_TOKEN);
    } else {
      await SecureStore.deleteItemAsync(this.TOKEN_KEYS.ACCESS_TOKEN);
      await SecureStore.deleteItemAsync(this.TOKEN_KEYS.REFRESH_TOKEN);
    }
  }

  async refreshAccessToken(): Promise<string | null> {
    // Prevent multiple concurrent refresh requests (single flight)
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = this.performTokenRefresh();
    
    try {
      const result = await this.refreshTokenPromise;
      return result;
    } finally {
      this.refreshTokenPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<string | null> {
    try {
      const refreshToken = await this.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await this.refreshClient.post('/auth/refresh', {
        refresh_token: refreshToken,
      });

      const { access_token, refresh_token: newRefreshToken } = response.data;
      
      // Update both tokens
      await this.setTokens({
        accessToken: access_token,
        refreshToken: newRefreshToken || refreshToken, // Use existing if not provided
      });

      return access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      
      // Clear tokens on refresh failure to force re-authentication
      await this.clearTokens();
      
      // Dispatch authentication failure event
      this.dispatchAuthFailure();
      
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null && token.length > 0;
  }

  async attachAuthHeaders(config: AxiosRequestConfig): Promise<AxiosRequestConfig> {
    const token = await this.getAccessToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  }

  // Method to create an axios interceptor-compatible refresh handler
  createAuthInterceptor() {
    return {
      request: async (config: AxiosRequestConfig) => {
        // Add retry marker to prevent infinite loops
        if (!config.headers?.['_retry']) {
          const token = await this.getAccessToken();
          if (token) {
            config.headers = {
              ...config.headers,
              Authorization: `Bearer ${token}`,
            };
          }
        }
        return config;
      },

      response: async (response: AxiosResponse) => {
        return response;
      },

      responseError: async (error: any) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newToken = await this.refreshAccessToken();
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axios(originalRequest);
            }
          } catch (refreshError) {
            console.error('Failed to refresh token:', refreshError);
          }

          // If refresh failed, clear tokens and redirect to login
          await this.clearTokens();
          this.dispatchAuthFailure();
        }

        return Promise.reject(error);
      },
    };
  }

  private dispatchAuthFailure() {
    // Could dispatch a global event or update a state management system
    console.log('Authentication failed - tokens cleared');
  }
}

// Export singleton instance
let authService: AuthServiceImpl | null = null;

export const getAuthService = (): AuthService => {
  if (!authService) {
    authService = new AuthServiceImpl();
  }
  return authService;
};

export const createAuthInterceptor = (axiosInstance?: AxiosInstance) => {
  const service = getAuthService();
  return (instance?: AxiosInstance) => {
    const target = axiosInstance || instance;
    if (target) {
      target.interceptors.request.use(async (config: any) => {
        return (await service.attachAuthHeaders(config)) as any;
      });
    }
  };
};