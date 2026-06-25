export const storage = {
    getItem: async (key) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
        return null;
    },
    setItem: async (key, value) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
        }
    },
    removeItem: async (key) => {
        if (typeof window !== 'undefined' && window.localStorage) {
            try {
                window.localStorage.removeItem(key);
            } catch {
                // ignore
            }
        }
    },
};
