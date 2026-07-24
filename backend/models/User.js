import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    avatar: { type: String, default: '' },
    type: { type: String, enum: ['human', 'device'], default: 'human' },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    fcmToken: { type: String, default: null }, // Firebase Cloud Messaging token de gui push notification
  },
  { timestamps: true }
);

// So sanh mat khau khi dang nhap
userSchema.methods.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Khong tra ve passwordHash khi chuyen sang JSON (vi du tra ve cho client)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', userSchema);
