import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { getMyNotifications, markAsRead } from '../controllers/notification.controller';

const router = Router();

router.get('/', authenticateToken, getMyNotifications);
router.patch('/:id/read', authenticateToken, markAsRead);

export default router;
