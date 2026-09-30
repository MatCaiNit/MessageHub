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
  getDeviceCommand
} from '../controllers/deviceController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerDeviceRules, addMemberRules, deviceIdParamRule } from '../validators/deviceValidator.js';

const router = express.Router();

router.use(protect);

router.post('/', registerDeviceRules, validate, registerDevice);

router.get('/hubs', listDeviceHubs);
router.get('/', listMyDevices);
router.patch('/:id/revoke', deviceIdParamRule, validate, revokeDevice);
router.patch('/:id/regenerate-key', deviceIdParamRule, validate, regenerateApiKey);
router.post('/:id/members', addMemberRules, validate, addMember);
router.delete('/:id/members/:userId', removeMember);

// App (user đã đăng nhập) gửi lệnh
router.patch('/:id/command', protect, setDeviceCommand);
 
// ESP32 poll lệnh, xác thực bằng X-Device-Key
router.get('/:id/command', deviceAuth, getDeviceCommand);
export default router;