import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  createRestaurant,
  getRestaurants,
  getRestaurantById,
  updateRestaurant
} from '../controllers/restaurant.controller';
import {
  addMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem
} from '../controllers/menu.controller';

const router = Router();

// Restaurant routes
router.get('/', authenticateToken, getRestaurants);
router.post('/', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), createRestaurant);
router.get('/:id', authenticateToken, getRestaurantById);
router.put('/:id', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), updateRestaurant);

// Menu item routes
router.post('/:id/menu', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), addMenuItem);
router.get('/:id/menu', authenticateToken, getMenuItems);
router.put('/:id/menu/:itemId', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), updateMenuItem);
router.delete('/:id/menu/:itemId', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), deleteMenuItem);

export default router;
