// backend/controllers/profileController.js
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  revokeAllRefreshTokens,
} from '../utils/generateToken.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PATCH /api/users/me - sua ten hien thi, username, email (chi cac truong duoc gui len)
export const updateMe = async (req, res) => {
  try {
    const { displayName, username, email } = req.body;
    const updates = {};

    if (displayName !== undefined) {
      const v = String(displayName).trim();
      if (v.length > 50) {
        return res.status(400).json({ message: 'Ten hien thi toi da 50 ky tu' });
      }
      updates.displayName = v;
    }

    if (username !== undefined) {
      const v = String(username).trim();
      if (v.length < 3 || v.length > 20 || !/^[a-zA-Z0-9_]+$/.test(v)) {
        return res.status(400).json({ message: 'Username phai tu 3-20 ky tu, chi gom chu cai, so va dau gach duoi' });
      }
      updates.username = v;
    }

    if (email !== undefined) {
      const v = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(v)) {
        return res.status(400).json({ message: 'Email khong hop le' });
      }
      updates.email = v;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Khong co thong tin nao de cap nhat' });
    }

    // Kiem tra username/email da bi nguoi khac dung chua
    const dupConds = [];
    if (updates.username) dupConds.push({ username: updates.username });
    if (updates.email) dupConds.push({ email: updates.email });
    if (dupConds.length > 0) {
      const dup = await User.findOne({ _id: { $ne: req.userId }, $or: dupConds });
      if (dup) {
        const field = updates.username && dup.username === updates.username ? 'Username' : 'Email';
        return res.status(400).json({ message: `${field} da duoc su dung` });
      }
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true });
    if (!user) return res.status(404).json({ message: 'Khong tim thay user' });

    res.json(user);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ message: 'Username hoac email da duoc su dung' });
    }
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// PATCH /api/users/me/password - doi mat khau, dang xuat cac thiet bi khac,
// tra ve token moi de thiet bi hien tai dang nhap tiep.
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Vui long nhap mat khau hien tai va mat khau moi' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Mat khau moi phai co it nhat 6 ky tu' });
    }
    if (!/[A-Z]/.test(String(newPassword))) {
      return res.status(400).json({ message: 'Mat khau moi phai co it nhat 1 chu in hoa' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'Mat khau moi phai khac mat khau hien tai' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Khong tim thay user' });

    const ok = await user.comparePassword(currentPassword);
    if (!ok) {
      return res.status(400).json({ message: 'Mat khau hien tai khong dung' });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(String(newPassword), salt);
    await user.save();

    // Huy moi phien cu (cac thiet bi khac phai dang nhap lai), cap token moi cho phien nay
    await revokeAllRefreshTokens(user._id);
    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id);

    res.json({ message: 'Da doi mat khau', accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};