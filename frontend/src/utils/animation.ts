import { Platform } from 'react-native';

/**
 * Platform-aware Animation Driver Helper
 * Returns false on Web to eliminate "useNativeDriver is not supported" warnings.
 * Returns true on iOS and Android for native hardware acceleration.
 */
export const supportsNativeAnimationDriver = Platform.OS !== 'web';
