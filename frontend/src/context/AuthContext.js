import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';
import { storage } from '../utils/storage';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [me, setMe] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true); // dang kiem tra session cu

  // Khi mo app: kiem tra xem da co token luu san chua, neu co thi tu dong restore session
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await storage.getItem('accessToken');
        const userStr = await storage.getItem('me');
        if (token && userStr) {
          setAccessToken(token);
          setMe(JSON.parse(userStr));
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  const login = async ({ email, password }) => {
    const { data } = await authApi.login({ email, password });
    await _saveSession(data);
  };

  const register = async ({ username, email, password }) => {
    const { data } = await authApi.register({ username, email, password });
    await _saveSession(data);
  };

  const logout = async () => {
    try {
      const refreshToken = await storage.getItem('refreshToken');
      await authApi.logout(refreshToken);
    } catch (_) {}
    await _clearSession();
  };

  // Cap nhat thong tin user hien tai (sau khi sua profile) - luu ca vao storage
  const updateProfile = async (user) => {
    const merged = { ...(me || {}), ...user };
    await storage.setItem('me', JSON.stringify(merged));
    setMe(merged);
  };

  // Luu token moi (sau khi doi mat khau, BE huy token cu va cap token moi)
  const applyTokens = async ({ accessToken: at, refreshToken: rt }) => {
    if (at) {
      await storage.setItem('accessToken', at);
      setAccessToken(at);
    }
    if (rt) await storage.setItem('refreshToken', rt);
  };

  const _saveSession = async (data) => {
    await storage.setItem('accessToken', data.accessToken);
    await storage.setItem('refreshToken', data.refreshToken);
    await storage.setItem('me', JSON.stringify(data.user));
    setAccessToken(data.accessToken);
    setMe(data.user);
  };

  const _clearSession = async () => {
    await storage.multiRemove(['accessToken', 'refreshToken', 'me']);
    setAccessToken(null);
    setMe(null);
  };

  return (
    <AuthContext.Provider
      value={{ me, accessToken, loading, login, register, logout, updateProfile, applyTokens }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);