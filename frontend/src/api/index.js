// frontend/src/api/index.js
import client from './client';

// ─── AUTH ───────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data) => client.post('/api/auth/register', data),
  login: (data) => client.post('/api/auth/login', data),
  refresh: (refreshToken) => client.post('/api/auth/refresh', { refreshToken }),
  logout: (refreshToken) => client.post('/api/auth/logout', { refreshToken }),
  logoutAll: () => client.post('/api/auth/logout-all'),
  getMe: () => client.get('/api/auth/me'),
};

// ─── USERS ──────────────────────────────────────────────────────────────────
export const userApi = {
  search: (q) => client.get(`/api/users/search?q=${encodeURIComponent(q)}`),
  updateFcmToken: (fcmToken) => client.patch('/api/users/fcm-token', { fcmToken }),
};

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────
export const conversationApi = {
  list: (page = 1, limit = 20) =>
    client.get(`/api/conversations?page=${page}&limit=${limit}`),

  create: (participantId) =>
    client.post('/api/conversations', { participantId }),

  // FIX: BE mong `participantIds`, khong phai `memberIds`
  createGroup: (name, memberIds, isPublic) =>
    client.post('/api/conversations/group', {
      name,
      participantIds: memberIds,
      ...(typeof isPublic === 'boolean' ? { isPublic } : {}),
    }),

  // Lay tin nhan cua 1 conversation (co phan trang)
  getMessages: (conversationId, page = 1, limit = 30) =>
    client.get(`/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`),

  // FIX: BE khong co GET /:id, dung /:id/members thay vi getDetail
  // Tra ve { members, adminId, isPublic }
  getGroupMembers: (conversationId) =>
    client.get(`/api/conversations/${conversationId}/members`),

  // FIX: URL cua BE la PATCH /:id (khong co /info),
  // va nhan ca { name?, avatar?, isPublic? } trong body
  updateGroupInfo: (conversationId, updates) =>
    client.patch(`/api/conversations/${conversationId}`, updates),

  addMember: (conversationId, userId) =>
    client.post(`/api/conversations/${conversationId}/members`, { userId }),

  // FIX: bo sung leaveGroup - GroupInfoScreen dang goi ma khong duoc export
  leaveGroup: (conversationId) =>
    client.post(`/api/conversations/${conversationId}/leave`),

  // FIX: bo sung kickMember - GroupInfoScreen dang goi ma khong duoc export
  kickMember: (conversationId, userId) =>
    client.delete(`/api/conversations/${conversationId}/members/${userId}`),

  // Bo sung joinGroup (BE co, FE chua expose)
  joinGroup: (conversationId) =>
    client.post(`/api/conversations/${conversationId}/join`),
};

// ─── MESSAGES ────────────────────────────────────────────────────────────────
export const messageApi = {
  delete: (messageId) => client.delete(`/api/messages/${messageId}`),
  recall: (messageId) => client.patch(`/api/messages/${messageId}/recall`),
  markSeen: (messageId) => client.patch(`/api/messages/${messageId}/seen`),
};

// ─── DEVICES ─────────────────────────────────────────────────────────────────
// Chua ai goi tren FE nhung expose san de con lam man quan ly thiet bi
export const deviceApi = {
  register: (name) => client.post('/api/devices', { name }),
  listMine: () => client.get('/api/devices'),
  revoke: (deviceId) => client.patch(`/api/devices/${deviceId}/revoke`),
  regenerateKey: (deviceId) => client.patch(`/api/devices/${deviceId}/regenerate-key`),
  addMember: (deviceId, userId) => client.post(`/api/devices/${deviceId}/members`, { userId }),
  removeMember: (deviceId, userId) => client.delete(`/api/devices/${deviceId}/members/${userId}`),
};

// ─── SYNC ────────────────────────────────────────────────────────────────────
export const syncApi = {
  sync: (since) => client.get(`/api/sync?since=${encodeURIComponent(since)}`),
};