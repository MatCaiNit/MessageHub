import mongoose from 'mongoose';

const outputSchema = new mongoose.Schema(
  {
    // Khop chinh xac voi truong `id` trong mang outputs[] cua firmware
    outputId: { type: String, required: true },
 
    // Ten hien thi tren app: 'Den phong khach', 'Coi bao dong'...
    label: { type: String, default: '' },
 
    // Loai dau ra, dung de app chon icon phu hop
    kind: {
      type: String,
      enum: ['led', 'relay', 'buzzer', 'other'],
      default: 'other',
    },
 
    // GPIO tren ESP32 - chi de hien thi/tra cuu, firmware tu biet pin cua no
    pin: { type: Number },
 
    // Trang thai THUC do ESP32 bao ve. Day la nguon su that cho nut
    // toggle tren app; khong co no thi app chi doan trang thai.
    state: { type: Boolean, default: false },
  },
  { _id: false }
);

const pendingCommandSchema = new mongoose.Schema(
  {
    outputId: { type: String, required: true },
    state: { type: Boolean, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const deviceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    apiKeyHash: { type: String, required: true },

    linkedUserAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },

    isActive: { type: Boolean, default: true }, // false khi bi thu hoi
    lastSeenAt: { type: Date, default: null }, // lan cuoi thiet bi gui du lieu len
    outputs: {
      type: [outputSchema],
      default: [],
    },
  
    // Hang doi lenh cho ESP32 lay ve o lan poll ke tiep.
    // Moi outputId chi giu duy nhat mot lenh moi nhat (xem controller).
    pendingCommands: {
      type: [pendingCommandSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model('Device', deviceSchema);
