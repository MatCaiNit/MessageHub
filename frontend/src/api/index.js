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
};

// ─── CONVERSATIONS ───────────────────────────────────────────────────────────
export const conversationApi = {
  list: (page = 1, limit = 20) =>
    client.get(`/api/conversations?page=${page}&limit=${limit}`),
  create: (participantId) =>
    client.post('/api/conversations', { participantId }),
  createGroup: (name, memberIds) =>
    client.post('/api/conversations/group', { name, memberIds }),
  getDetail: (conversationId) =>
    client.get(`/api/conversations/${conversationId}`),
  getMessages: (conversationId, page = 1, limit = 30) =>
    client.get(`/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`),
  updateGroupInfo: (conversationId, name) =>
    client.patch(`/api/conversations/${conversationId}/info`, { name }),
  addMember: (conversationId, userId) =>
    client.post(`/api/conversations/${conversationId}/members`, { userId }),
  removeMember: (conversationId, userId) =>
    client.delete(`/api/conversations/${conversationId}/members/${userId}`),
};

// ─── MESSAGES ────────────────────────────────────────────────────────────────
export const messageApi = {
  delete: (messageId) => client.delete(`/api/messages/${messageId}`),
  recall: (messageId) => client.patch(`/api/messages/${messageId}/recall`),
  markSeen: (messageId) => client.patch(`/api/messages/${messageId}/seen`),
};

// ─── SYNC ────────────────────────────────────────────────────────────────────
export const syncApi = {
  sync: (since) => client.get(`/api/sync?since=${since}`),
};
