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

   // Server -> Client: cap nhat nhom (co the dung de FE tu refresh sidebar/chat header)
  GROUP_UPDATED: 'group_updated',
  GROUP_MEMBER_JOINED: 'group_member_joined',
  GROUP_MEMBER_LEFT: 'group_member_left',
  GROUP_MEMBER_KICKED: 'group_member_kicked',
};
