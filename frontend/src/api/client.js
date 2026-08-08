import axios from 'axios';
import { API_URL } from './config';
import { storage } from '../utils/storage';

const client = axios.create({ baseURL: API_URL });

// Tu dong gan accessToken vao moi request neu co
client.interceptors.request.use(async (config) => {
  const token = await storage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Neu accessToken het han (401, code TOKEN_EXPIRED) -> tu dong goi refresh 1 lan roi thu lai request
let isRefreshing = false;
let pendingQueue = [];

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 401 && code === 'TOKEN_EXPIRED' && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Neu dang co 1 request refresh chay roi, xep hang doi ket qua thay vi goi refresh nhieu lan
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject, originalRequest });
        });
      }

      isRefreshing = true;
      try {
        const refreshToken = await storage.getItem('refreshToken');
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        await storage.setItem('accessToken', data.accessToken);

        pendingQueue.forEach(({ resolve, originalRequest: req }) => {
          req.headers.Authorization = `Bearer ${data.accessToken}`;
          resolve(client(req));
        });
        pendingQueue = [];

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return client(originalRequest);
      } catch (refreshErr) {
        // refreshToken cung het han/khong hop le -> buoc dang xuat
        await storage.multiRemove(['accessToken', 'refreshToken', 'me']);
        pendingQueue = [];
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default client;
