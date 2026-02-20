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
    }
};
