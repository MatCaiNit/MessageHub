import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    apiKeyHash: { type: String, required: true },

    linkedUserAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },

    isActive: { type: Boolean, default: true }, // false khi bi thu hoi
    lastSeenAt: { type: Date, default: null }, // lan cuoi thiet bi gui du lieu len
  },
  { timestamps: true }
);

export default mongoose.model('Device', deviceSchema);
