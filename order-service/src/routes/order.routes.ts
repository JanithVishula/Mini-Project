import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  placeOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder
} from '../controllers/order.controller';

const router = Router();

router.post('/', authenticateToken, requireRole('CUSTOMER'), placeOrder);
router.get('/', authenticateToken, getOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, requireRole('RESTAURANT_OWNER', 'RIDER', 'ADMIN'), updateOrderStatus);
router.patch('/:id/cancel', authenticateToken, requireRole('CUSTOMER'), cancelOrder);

export default router;
