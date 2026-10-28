import axios from 'axios';
import { API_URL } from './config';
import { storage } from '../utils/storage';

const client = axios.create({ baseURL: API_URL });

// ─── Su kien xac thuc: de AuthContext / SocketContext biet token vua doi hoac phien da het ───
const listeners = { tokenRefreshed: new Set(), authLost: new Set() };
export const authEvents = {
  on(event, fn) {
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  },
  emit(event, payload) {
    listeners[event].forEach((fn) => { try { fn(payload); } catch (_) {} });
  },
};


let refreshPromise = null;
export const refreshAccessToken = () => {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await storage.getItem('refreshToken');
    if (!refreshToken) return null;

    try {
      const { data } = await axios.post(
        `${API_URL}/api/auth/refresh`,
        { refreshToken },
        { timeout: 15000 }
      );
      await storage.setItem('accessToken', data.accessToken);
      authEvents.emit('tokenRefreshed', data.accessToken);
      return data.accessToken;
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 400) {
        // refreshToken het han / bi huy (vd sau khi doi mat khau) -> phai dang nhap lai
        await storage.multiRemove(['accessToken', 'refreshToken', 'me']);
        authEvents.emit('authLost');
        return null;
      }
      throw err; // loi mang: khong dang xuat
    }
  })().finally(() => { refreshPromise = null; });

  return refreshPromise;
};

// Tu dong gan accessToken vao moi request neu co
client.interceptors.request.use(async (config) => {
  const token = await storage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// accessToken het han / khong hop le -> refresh 1 lan roi thu lai request
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    const tokenProblem = status === 401 && (code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN');
    if (tokenProblem && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newToken = await refreshAccessToken();
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return client(originalRequest);
        }
      } catch (_) {
        // mat mang khi refresh -> tra ve loi goc
      }
    }

    return Promise.reject(error);
  }
);

export default client;