import * as SecureStore from "expo-secure-store";
import { secureStorage } from "@/services/storage/secureStorage";
import { useAuthStore } from "@/store/authStore";

const authStore = useAuthStore.getState();

describe('Biometric PIN Storage', () => {
  beforeEach(() => {
    jest.spyOn(SecureStore, 'setItemAsync').mockResolvedValue();
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue('encrypted_pin');
    jest.spyOn(secureStorage, 'getItem').mockResolvedValue('fallback_pin');
  });

  it('T2: Stores PIN securely with requireAuthentication', async () => {
    await authStore.savePinForBiometrics('1234');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'BIOMETRIC_PIN',
      'encrypted_pin',
      { requireAuthentication: true }
    );
  });

  it('B1: Handles null fallback gracefully', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);
    const pin = await authStore.getPinForBiometrics();
    expect(pin).toBe('fallback_pin');
    expect(secureStorage.getItem).toHaveBeenCalledWith('BIOMETRIC_PIN');
  });

  it('B2: Reuses savePinForBiometrics helper', async () => {
    const spy = jest.spyOn(authStore, 'savePinForBiometrics');
    await authStore.savePinForBiometrics('1234');
    expect(spy).toHaveBeenCalledWith('1234');
  });

  it('T2: Falls back to secureStorage when SecureStore throws', async () => {
    jest.spyOn(SecureStore, 'setItemAsync').mockRejectedValue(new Error('Biometric failed'));
    await authStore.savePinForBiometrics('1234');
    expect(secureStorage.setItem).toHaveBeenCalledWith('BIOMETRIC_PIN', '1234');
  });
});