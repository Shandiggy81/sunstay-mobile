/**
 * Platform Abstraction Layer
 * ──────────────────────────
 * Detects web vs mobile and provides cross-platform wrappers for:
 *   - Storage (localStorage / AsyncStorage)
 *   - Map engine flags
 *   - Platform detection helpers
 *
 * CROSS-PLATFORM DESIGN:
 *   Web builds use localStorage directly.
 *   For React Native / Expo, replace the storage adapter below with
 *   AsyncStorage imports. The interface remains identical.
 *
 * @module utils/platform
 */

// ── Platform Detection ──────────────────────────────────────────────

/**
 * @returns {boolean} true when running in a browser (Vite web, Expo web)
 */
export const isWeb = () => {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
};

/**
 * @returns {boolean} true when running in React Native (Expo iOS/Android)
 */
export const isMobile = () => {
    return !isWeb();
};

/**
 * @returns {'web' | 'mobile' | 'unknown'}
 */
export const getPlatform = () => {
    if (isWeb()) return 'web';
    // In a React Native build, you would use:
    //   import { Platform } from 'react-native';
    //   return Platform.OS; // 'ios' | 'android'
    return 'mobile';
};


// ── Cross-Platform Storage ──────────────────────────────────────────

/**
 * Unified storage adapter.
 * - Web  → localStorage (synchronous, wrapped in async interface)
 * - Mobile → swap implementation to AsyncStorage when building with Expo/RN
 *
 * Every method has a try/catch so callers never crash on storage errors.
 *
 * MOBILE MIGRATION NOTE:
 *   To add AsyncStorage support, install the package and add an else branch:
 *   ```
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *   // then in each method:  return await AsyncStorage.getItem(key);
 *   ```
 */
export const PlatformStorage = {
    /**
     * @param {string} key
     * @returns {Promise<string | null>}
     */
    async getItem(key) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                return window.localStorage.getItem(key);
            }
            // Mobile: AsyncStorage path would go here
            console.warn('[PlatformStorage] No storage available');
            return null;
        } catch (err) {
            console.warn('[PlatformStorage] getItem failed:', err.message);
            return null;
        }
    },

    /**
     * @param {string} key
     * @param {string} value
     * @returns {Promise<boolean>} true on success
     */
    async setItem(key, value) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
                return true;
            }
            // Mobile: AsyncStorage path would go here
            console.warn('[PlatformStorage] No storage available');
            return false;
        } catch (err) {
            console.warn('[PlatformStorage] setItem failed:', err.message);
            return false;
        }
    },

    /**
     * @param {string} key
     * @returns {Promise<boolean>} true on success
     */
    async removeItem(key) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
                return true;
            }
            // Mobile: AsyncStorage path would go here
            return false;
        } catch (err) {
            console.warn('[PlatformStorage] removeItem failed:', err.message);
            return false;
        }
    },

    /**
     * Clear all keys matching a prefix.
     * @param {string} prefix
     * @returns {Promise<void>}
     */
    async clearByPrefix(prefix) {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const toRemove = [];
                for (let i = 0; i < window.localStorage.length; i++) {
                    const key = window.localStorage.key(i);
                    if (key && key.startsWith(prefix)) toRemove.push(key);
                }
                toRemove.forEach(k => window.localStorage.removeItem(k));
                return;
            }
            // Mobile: AsyncStorage.getAllKeys() + multiRemove()
        } catch (err) {
            console.warn('[PlatformStorage] clearByPrefix failed:', err.message);
        }
    },
};


// ── Map Engine Flags ────────────────────────────────────────────────

/**
 * Tells components which map library to import.
 *
 * Web  → mapbox-gl  (already in package.json)
 * Mobile → @rnmapbox/maps (would need to be added for RN builds)
 */
export const PlatformMaps = {
    /** @type {'mapbox-gl' | '@rnmapbox/maps'} */
    engine: isWeb() ? 'mapbox-gl' : '@rnmapbox/maps',

    /** true when the GL JS web engine should be used */
    isWebGL: isWeb(),

    /** true when the native Mapbox RN SDK should be used */
    isNativeMapbox: !isWeb(),
};


// ── Melbourne Constants ─────────────────────────────────────────────

/** Default test coordinates (Melbourne CBD) */
export const MELBOURNE_COORDS = {
    lat: -37.8136,
    lon: 144.9631,
};

/** Melbourne timezone for timestamp formatting */
export const MELBOURNE_TZ = 'Australia/Melbourne';

/**
 * Format a Date in Melbourne local time.
 * @param {Date} date
 * @returns {string}
 */
export const formatMelbourneTime = (date = new Date()) => {
    return new Intl.DateTimeFormat('en-AU', {
        timeZone: MELBOURNE_TZ,
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};
