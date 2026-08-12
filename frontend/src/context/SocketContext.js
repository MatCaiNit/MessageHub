import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/config';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { accessToken } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;

    const newSocket = io(API_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
    });

    newSocket.on('connect', () => {
      setConnected(true);
    });
    newSocket.on('disconnect', () => {
      setConnected(false);
    });

    // Dung useState thay vi useRef de khi socket san sang,
    // cac component dung useSocket() tu dong render lai va nhan duoc socket that
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [accessToken]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);