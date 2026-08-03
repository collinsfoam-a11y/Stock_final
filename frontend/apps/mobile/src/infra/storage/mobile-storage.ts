import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SecureStorage } from '../../../../../packages/shared/storage/storage.interface';

export class MobileSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return await AsyncStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    await AsyncStorage.clear();
  }

  async getSecureItem(key: string): Promise<string | null> {
    return await SecureStore.getItemAsync(key);
  }

  async setSecureItem(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value, {
      requireAuthentication: false // Configure as needed
    });
  }

  async removeSecureItem(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  }
}