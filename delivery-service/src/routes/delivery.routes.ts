import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  createDelivery,
  getAvailableDeliveries,
  acceptDelivery,
  updateLocation,
  updateDeliveryStatus,
  getDeliveryById,
  getMyDeliveries
} from '../controllers/delivery.controller';

const router = Router();

router.post('/', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), createDelivery);
router.get('/available', authenticateToken, requireRole('RIDER'), getAvailableDeliveries);
router.get('/my', authenticateToken, requireRole('RIDER'), getMyDeliveries);
router.patch('/:id/accept', authenticateToken, requireRole('RIDER'), acceptDelivery);
router.patch('/:id/location', authenticateToken, requireRole('RIDER'), updateLocation);
router.patch('/:id/status', authenticateToken, requireRole('RIDER'), updateDeliveryStatus);
router.get('/:id', authenticateToken, getDeliveryById);

export default router;
