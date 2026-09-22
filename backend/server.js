import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';

import connectDB from './config/db.js';
import { initSocket } from './sockets/socketHandler.js';


import authRoutes from './routes/authRoutes.js';
import conversationRoutes from './routes/conversationRoutes.js';
import userRoutes from './routes/userRoutes.js';

import deviceRoutes from './routes/deviceRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import syncRoutes from './routes/syncRoutes.js';


connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/sync', syncRoutes);



app.get('/', (req, res) => {
  res.json({ message: 'Chat backend dang chay', status: 'ok' });
});


app.use((req, res) => {
  res.status(404).json({ message: `Khong tim thay route: ${req.method} ${req.originalUrl}` });
});


app.use((err, req, res, next) => {
  console.error('Loi khong xac dinh:', err.stack);
  res.status(500).json({ message: 'Da xay ra loi phia server' });
});

// Tao HTTP server de gan chung ca Express (REST) va Socket.IO (real-time) vao 1 cong
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' }, // demo: cho phep tat ca origin
});

initSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server dang chay tai http://localhost:${PORT}`);
});