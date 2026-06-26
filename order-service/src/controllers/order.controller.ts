import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';
import { getRestaurantWithMenu } from '../services/restaurant.service';

export async function placeOrder(req: AuthRequest, res: Response) {
  const { restaurantId, items, deliveryAddress } = req.body;
  const token = req.headers['authorization']!.split(' ')[1];

  if (!restaurantId || !items || items.length === 0 || !deliveryAddress) {
    res.status(400).json({ error: 'restaurantId, items and deliveryAddress are required' });
    return;
  }

  // Call restaurant-service to validate the restaurant and get real menu data
  const restaurant = await getRestaurantWithMenu(restaurantId, token);
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found or unavailable' });
    return;
  }

  // Build order items from REAL menu data (never trust prices from the client)
  const orderItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const menuItem = restaurant.menuItems.find((m: any) => m.id === item.menuItemId);
    if (!menuItem) {
      res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
      return;
    }
    const quantity = item.quantity ?? 1;
    totalAmount += menuItem.price * quantity;
    orderItems.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity
    });
  }

  const order = await prisma.order.create({
    data: {
      customerId: req.user!.userId,
      restaurantId,
      deliveryAddress,
      totalAmount,
      items: { create: orderItems }
    },
    include: { items: true }
  });

  res.status(201).json(order);
}

export async function getOrders(req: AuthRequest, res: Response) {
  const where = req.user!.role === 'ADMIN' ? {} : { customerId: req.user!.userId };

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(orders);
}

export async function getOrderById(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  res.json(order);
}

export async function updateOrderStatus(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { status } = req.body;

  const validStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status }
  });

  res.json(updated);
}

export async function cancelOrder(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (order.customerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only cancel your own orders' });
    return;
  }

  if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
    res.status(400).json({ error: 'Order can no longer be cancelled' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED' }
  });

  res.json(updated);
}
