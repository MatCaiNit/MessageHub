import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/config';
import { useAuth } from './AuthContext';
import { storage } from '../utils/storage';
import { refreshAccessToken } from '../api/client';

const SocketContext = createContext(null);

const MAX_TOKEN_RETRIES = 3;

export const SocketProvider = ({ children }) => {
  const { accessToken } = useAuth();
  const loggedIn = !!accessToken;   // chi phu thuoc "co dang nhap hay khong", KHONG phu thuoc gia tri token
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!loggedIn) return;

    let stopped = false;
    let tokenRetries = 0;

    const newSocket = io(API_URL, {
      // Doc token MOI NHAT tu storage moi lan (ke ca khi tu noi lai), khong dung gia tri cu
      auth: (cb) => {
        storage.getItem('accessToken').then((token) => cb({ token }));
      },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      tokenRetries = 0;
      setConnected(true);
    });
    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    // Server tu choi vi token het han/khong hop le -> lam moi token roi noi lai
    newSocket.on('connect_error', async (err) => {
      if (stopped) return;
      const msg = String(err?.message || '');
      if (/token/i.test(msg) && tokenRetries < MAX_TOKEN_RETRIES) {
        tokenRetries += 1;
        try {
          const t = await refreshAccessToken();
          if (t && !stopped) newSocket.connect();
        } catch (_) {
          // mat mang: de lan sau thu lai
        }
      }
    });

    // Dung useState thay vi useRef de khi socket san sang,
    // cac component dung useSocket() tu dong render lai va nhan duoc socket that
    setSocket(newSocket);

    return () => {
      stopped = true;
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [loggedIn]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);