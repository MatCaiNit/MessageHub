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


const sensorSchema = new mongoose.Schema(
  {
    // Khop chinh xac voi truong `id` trong mang sensors[] cua firmware
    sensorId: { type: String, required: true },

    // Ten hien thi tren app: 'Nhiet do & do am', 'Cam bien chuyen dong'...
    label: { type: String, default: '' },

    // Loai cam bien, dung de app chon icon phu hop (giong kind cua output)
    kind: {
      type: String,
      enum: ['pir', 'dht', 'sound', 'distance', 'gas', 'other'],
      default: 'other',
    },

    // Trang thai THUC do ESP32 bao ve (dang doc hay dang tam ngung).
    enabled: { type: Boolean, default: true },
  },
  { _id: false }
);

const pendingSensorCommandSchema = new mongoose.Schema(
  {
    sensorId: { type: String, required: true },
    enabled: { type: Boolean, required: true },
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

    sensors: {
      type: [sensorSchema],
      default: [],
    },
    pendingSensorCommands: {
      type: [pendingSensorCommandSchema],
      default: [],
    },

    lastTelemetry: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastTelemetryAt: {
      type: Date,
      default: null,
    },

  },
  { timestamps: true }
);

export default mongoose.model('Device', deviceSchema);