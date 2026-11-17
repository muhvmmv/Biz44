import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const controller = new AuthController();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', authenticate, controller.getMe);
router.put('/me', authenticate, controller.updateMe);
router.post('/change-password', authenticate, controller.changePassword);
router.post('/delete-account', authenticate, controller.deleteAccount);

export default router;