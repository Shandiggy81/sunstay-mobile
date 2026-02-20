/**
 * Vite-Safe Platform Storage Adapter
 * Bypasses Vite's static import analyzer by relying on standard web APIs
 */

export const storage = {
    getItem: async (key) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
        console.warn(`[SunStay] Storage not available for key: ${key}`);
        return null;
    },

    setItem: async (key, value) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
            return;
        }
        console.warn(`[SunStay] Storage not available for key: ${key}`);
    }
};
