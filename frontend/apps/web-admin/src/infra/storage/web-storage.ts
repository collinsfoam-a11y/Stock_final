import { SecureStorage } from '../../../../../packages/shared/storage/storage.interface';

export class WebSecureStorage implements SecureStorage {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  async getSecureItem(key: string): Promise<string | null> {
    // For web, we'll use the same storage but could implement additional encryption
    return localStorage.getItem(key);
  }

  async setSecureItem(key: string, value: string): Promise<void> {
    // For web, we'll use the same storage but could implement additional encryption
    localStorage.setItem(key, value);
  }

  async removeSecureItem(key: string): Promise<void> {
    localStorage.removeItem(key);
  }
}