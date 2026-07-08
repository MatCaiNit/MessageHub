import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    // 'text' cho nguoi-nguoi, 'device_event'/'device_telemetry' danh cho sau nay khi tich hop thiet bi nhung
    type: { type: String, enum: ['text', 'device_event', 'device_telemetry'], default: 'text' },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
  },
  { timestamps: true }
);

export default mongoose.model('Message', messageSchema);
