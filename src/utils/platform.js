import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
    getItem: async (key) => {
        if (Platform.OS === 'web') {
            return window.localStorage.getItem(key);
        }
        return await AsyncStorage.getItem(key);
    },
    setItem: async (key, value) => {
        if (Platform.OS === 'web') {
            window.localStorage.setItem(key, value);
        } else {
            await AsyncStorage.setItem(key, value);
        }
    }
};
