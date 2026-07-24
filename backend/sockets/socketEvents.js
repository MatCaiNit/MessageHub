export const SOCKET_EVENTS = {
  // Client -> Server
  SEND_MESSAGE: 'send_message',
  TYPING: 'typing',
  STOP_TYPING: 'stop_typing',

  // Server -> Client
  RECEIVE_MESSAGE: 'receive_message',
  MESSAGE_DELETED: 'message_deleted',
  MESSAGE_RECALLED: 'message_recalled',
  MESSAGE_SEEN: 'message_seen',
  USER_ONLINE: 'user_online',
  USER_OFFLINE: 'user_offline',
  USER_TYPING: 'user_typing',
  USER_STOP_TYPING: 'user_stop_typing',
  ERROR_MESSAGE: 'error_message',
};
