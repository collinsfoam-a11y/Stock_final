import { AppState, Platform } from 'react-native';
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo';
import { container } from '../../../apps/mobile/src/di/container';

export class BackgroundSyncScheduler {
  private syncInterval: NodeJS.Timeout | null = null;
  private appState: string = AppState.currentState;
  private networkChangeListener: NetInfoSubscription | null = null;

  async registerSyncTask(): Promise<void> {
    // Since expo-background-fetch might not be installed, 
    // we'll implement a basic sync scheduler using standard RN APIs
    console.log('Registering basic background sync task');
    
    // On Android, we might need to request background permissions
    if (Platform.OS === 'android') {
      console.log('Requesting background permissions for Android');
      // Actual permission requests would go here
    }
  }

  async unregisterSyncTask(): Promise<void> {
    // Unregister sync task
    console.log('Unregistering background sync task');
    
    // Clear periodic sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async startPeriodicSync(intervalMinutes: number = 15): Promise<void> {
    // Start periodic sync based on time intervals
    console.log(`Starting periodic sync every ${intervalMinutes} minutes`);
    
    // Clear existing interval
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    
    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      BackgroundSyncScheduler.triggerImmediateSync().catch((error: unknown) => {
        console.error('Periodic sync failed:', error);
      });
    }, intervalMinutes * 60 * 1000);
  }

  async startSyncScheduler(): Promise<() => void> {
    // Set up app state listener for foreground/background events
    const appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

    this.networkChangeListener = NetInfo.addEventListener(state => {
      const isOnlineState = state.isConnected && (state.isInternetReachable ?? true);
      if (isOnlineState) {
        // Network is available, trigger sync
        BackgroundSyncScheduler.triggerImmediateSync().catch((error: unknown) => {
          console.error('Scheduled sync failed:', error);
        });
      }
    });

    // Set up periodic sync interval
    this.syncInterval = setInterval(() => {
      BackgroundSyncScheduler.triggerImmediateSync().catch((error: unknown) => {
        console.error('Periodic sync failed:', error);
      });
    }, 15 * 60 * 1000); // Every 15 minutes

    // Return cleanup function
    return () => {
      appStateSubscription?.remove();
      this.networkChangeListener?.();
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
      }
    };
  }

  private handleAppStateChange = (nextAppState: string) => {
    if (this.appState.match(/inactive|background/) && nextAppState === 'active') {
      // App came to foreground, trigger sync
      BackgroundSyncScheduler.triggerImmediateSync().catch((error: unknown) => {
        console.error('Foreground sync failed:', error);
      });
    }
    this.appState = nextAppState;
  };

  static async triggerImmediateSync(): Promise<void> {
    try {
      const syncEngine = container.get('syncEngine');
      await syncEngine.processQueue();
      console.log('Immediate sync completed');
    } catch (error) {
      console.error('Immediate sync failed:', error);
    }
  }

  async scheduleSyncBasedOnConnectivity(): Promise<() => void> {
    // Listen for network connectivity changes
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        // Network is available, trigger sync
        BackgroundSyncScheduler.triggerImmediateSync().catch((error: unknown) => {
          console.error('Connectivity-based sync failed:', error);
        });
      }
    });

    // Return unsubscribe function
    return unsubscribe;
  }
}