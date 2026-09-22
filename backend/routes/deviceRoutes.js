import express from 'express';
import {
  registerDevice,
  listMyDevices,
  listDeviceHubs,
  revokeDevice,
  regenerateApiKey,
  addMember,
  removeMember,
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

export default router;