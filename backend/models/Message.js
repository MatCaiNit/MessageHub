import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    // 'text' cho nguoi-nguoi, 'device_event'/'device_telemetry' danh cho sau nay khi tich hop thiet bi nhung
    type: { type: String, enum: ['text', 'image', 'file', 'device_event', 'device_telemetry'], default: 'text' },
    attachments: [
      {
        url: String,
        fileType: String,
        fileName: String,
      },
    ],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    seenBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        seenAt: { type: Date, default: Date.now },
      },
    ],

    isDeleted: { type: Boolean, default: false }, // xoa phia nguoi gui (chi minh khong thay)
    isRecalled: { type: Boolean, default: false }, // thu hoi - moi nguoi trong hoi thoai deu khong thay noi dung goc

    deviceData: { type: mongoose.Schema.Types.Mixed, default: null }, // Du lieu tho tu thiet bi nhung (vi du: { temperature: 36, humidity: 55 })
  },
  { timestamps: true }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
