/**
 * Cross-platform storage adapter
 * Web: localStorage (direct)
 * Mobile: AsyncStorage (dynamic import, only loaded on RN)
 */
export const storage = {
    getItem: async (key) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key); // Web
        }
        // Mobile only — dynamic import so Vite never bundles it
        const { default: AsyncStorage } = await import(/* @vite-ignore */ '@react-native-async-storage/async-storage');
        return await AsyncStorage.getItem(key);
    },
    setItem: async (key, value) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.setItem(key, value); // Web
        }
        const { default: AsyncStorage } = await import(/* @vite-ignore */ '@react-native-async-storage/async-storage');
        return await AsyncStorage.setItem(key, value);
    }
};
