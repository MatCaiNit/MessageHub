import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage tu dong dung localStorage khi chay web (nho react-native-web),
// va dung bo nho native that khi chay app - nen code goi ham nay giong het nhau
// tren ca 2 nen tang, khong can if/else phan biet platform

export const storage = {
  async getItem(key) {
    return AsyncStorage.getItem(key);
  },
  async setItem(key, value) {
    return AsyncStorage.setItem(key, value);
  },
  async removeItem(key) {
    return AsyncStorage.removeItem(key);
  },
  async multiRemove(keys) {
    return AsyncStorage.multiRemove(keys);
  },
};
