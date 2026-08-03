import { router } from 'expo-router';
import { AppState, AppStateStatus } from 'react-native';
import { container } from '../../../apps/mobile/src/di/container';
import { useAuthStore } from '../../store/authStore';

export class NavigationService {
  private authFailureHandlers: Array<() => void> = [];
  private appState: AppStateStatus = AppState.currentState;
  private appStateSubscription: any = null;

  constructor() {
    // Subscribe to app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground
      this.handleForeground();
    } else if (nextAppState.match(/inactive|background/)) {
      // App went to background
      this.handleBackground();
    }
    
    this.appState = nextAppState;
  };

  private handleForeground(): void {
    // Check for pending operations when app comes to foreground
    // Potentially trigger sync operations
    console.log('App came to foreground');
    
    // Trigger immediate sync on foreground
    this.triggerSyncIfPossible();
  }

  private handleBackground(): void {
    // Handle background operations
    // Potentially stop intensive operations
    console.log('App went to background');
  }

  private async triggerSyncIfPossible(): Promise<void> {
    try {
      const syncEngine = container.get('syncEngine');
      await syncEngine.processQueue();
      console.log('Sync triggered on foreground');
    } catch (error) {
      console.error('Sync failed on foreground:', error);
    }
  }

  navigate(route: string, params?: any): void {
    // Expo Router doesn't support params in navigate, so we use push with query
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    router.push(`${route}${queryString}`);
  }

  replace(route: string, params?: any): void {
    const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
    router.replace(`${route}${queryString}`);
  }

  goBack(): void {
    router.back();
  }

  getCurrentRoute(): string {
    // Expo Router doesn't provide a direct way to get current route
    // We'll implement a custom solution or use a state management solution
    return ''; // Placeholder - in a real implementation, this would track current route
  }

  setAuthToken(token: string): void {
    // Store token in secure storage
    // Implementation would use SecureStorageService
    console.log('Setting auth token');
  }

  clearAuthToken(): void {
    // Clear token from storage and navigate to login
    router.replace('/login');
  }

  onAuthFailure(): void {
    // Clear auth state
    useAuthStore.getState().logout();
    
    // Navigate to login
    router.replace('/login');
    
    // Notify all subscribers
    this.authFailureHandlers.forEach(handler => handler());
  }

  subscribeAuthFailure(handler: () => void): () => void {
    this.authFailureHandlers.push(handler);
    
    // Return unsubscribe function
    return () => {
      const index = this.authFailureHandlers.indexOf(handler);
      if (index > -1) {
        this.authFailureHandlers.splice(index, 1);
      }
    };
  }

  // Cleanup method to remove event listeners
  cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
  }
}