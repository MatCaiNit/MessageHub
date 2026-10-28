import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';
import { storage } from '../utils/storage';
import { authEvents, refreshAccessToken } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [me, setMe] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true); // dang kiem tra session cu

  // Khi mo app: neu co phien luu san thi khoi phuc, roi LAM MOI accessToken ngay
  // (token luu tu lan truoc thuong da het han sau 15 phut -> socket/API se loi neu khong lam moi).
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const token = await storage.getItem('accessToken');
        const refreshToken = await storage.getItem('refreshToken');
        const userStr = await storage.getItem('me');
        if (userStr && (token || refreshToken)) {
          setMe(JSON.parse(userStr));
          let at = token;
          if (refreshToken) {
            try {
              at = await refreshAccessToken();   // null -> refreshToken het han (authLost da xoa phien)
            } catch (_) {
              at = token;                         // mat mang: dung tam token cu, thu lai sau
            }
          }
          if (at) setAccessToken(at);
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    restoreSession();
  }, []);

  // Token duoc lam moi o noi khac (interceptor / socket) -> cap nhat state;
  // phien het han han (refreshToken khong con hop le) -> ve man hinh dang nhap.
  useEffect(() => {
    const offRefreshed = authEvents.on('tokenRefreshed', (at) => setAccessToken(at));
    const offLost = authEvents.on('authLost', () => {
      setAccessToken(null);
      setMe(null);
    });
    return () => { offRefreshed(); offLost(); };
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