import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
} from '../utils/generateToken.js';

// POST /api/auth/register
export const register = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Username hoac email da ton tai' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({ username, email, passwordHash });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/auth/login
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Email hoac mat khau khong dung' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Email hoac mat khau khong dung' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = await generateRefreshToken(user._id);

    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/auth/refresh - dung refreshToken de lay accessToken moi khi accessToken het han
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    const stored = await verifyRefreshToken(refreshToken);
    if (!stored) {
      return res.status(401).json({ message: 'Refresh token khong hop le hoac da het han' });
    }

    const newAccessToken = generateAccessToken(stored.userId);

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/auth/logout - thu hoi 1 refreshToken cu the (dang xuat thiet bi hien tai)
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    res.json({ message: 'Da dang xuat' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// POST /api/auth/logout-all - thu hoi toan bo refreshToken cua user (dang xuat tat ca thiet bi)
export const logoutAll = async (req, res) => {
  try {
    await revokeAllRefreshTokens(req.userId);
    res.json({ message: 'Da dang xuat tren tat ca thiet bi' });
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};

// GET /api/auth/me
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Khong tim thay user' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Loi server', error: err.message });
  }
};
