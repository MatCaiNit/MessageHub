import express from 'express';
import {
  registerDevice,
  listMyDevices,
  listDeviceHubs,
  revokeDevice,
  regenerateApiKey,
  addMember,
  removeMember,
  setDeviceCommand,
  getDeviceCommand,
  getDeviceById,
  getDeviceTelemetryHistory,
} from '../controllers/deviceController.js';
import { protect } from '../middleware/auth.js';
import { deviceProtect } from '../middleware/deviceAuth.js';
import { validate } from '../middleware/validate.js';
import { registerDeviceRules, addMemberRules, deviceIdParamRule } from '../validators/deviceValidator.js';

const router = express.Router();
router.get('/:id/command', deviceProtect, getDeviceCommand);

router.use(protect);

router.post('/', registerDeviceRules, validate, registerDevice);

router.get('/hubs', listDeviceHubs);
router.get('/', listMyDevices);

// App lấy chi tiết 1 thiết bị để đối chiếu trạng thái outputs thật sau khi bấm nút
router.get('/:id', deviceIdParamRule, validate, getDeviceById);

// App (Dashboard) lấy lịch sử các lần đọc cảm biến để vẽ biểu đồ
router.get('/:id/telemetry', deviceIdParamRule, validate, getDeviceTelemetryHistory);

router.patch('/:id/revoke', deviceIdParamRule, validate, revokeDevice);
router.patch('/:id/regenerate-key', deviceIdParamRule, validate, regenerateApiKey);

// App (đã đăng nhập bằng JWT) gửi lệnh bật/tắt cho 1 output cụ thể
// Body: { outputId: 'relay1', state: true }
router.patch('/:id/command', deviceIdParamRule, validate, setDeviceCommand);

router.post('/:id/members', addMemberRules, validate, addMember);
router.delete('/:id/members/:userId', removeMember);

export default router;