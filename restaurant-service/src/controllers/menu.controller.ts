import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

export async function addMenuItem(req: AuthRequest, res: Response) {
  const restaurantId = req.params.id as string;
  const { name, description, price, category, imageUrl } = req.body;

  if (!name || !price || !category) {
    res.status(400).json({ error: 'Name, price and category are required' });
    return;
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only add items to your own restaurant' });
    return;
  }

  const menuItem = await prisma.menuItem.create({
    data: { restaurantId, name, description, price, category, imageUrl }
  });

  res.status(201).json(menuItem);
}

export async function getMenuItems(req: AuthRequest, res: Response) {
  const restaurantId = req.params.id as string;

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true }
  });

  res.json(menuItems);
}

export async function updateMenuItem(req: AuthRequest, res: Response) {
  const restaurantId = req.params.id as string;
  const itemId = req.params.itemId as string;
  const { name, description, price, category, imageUrl, isAvailable } = req.body;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only update items in your own restaurant' });
    return;
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: { name, description, price, category, imageUrl, isAvailable }
  });

  res.json(updated);
}

export async function deleteMenuItem(req: AuthRequest, res: Response) {
  const restaurantId = req.params.id as string;
  const itemId = req.params.itemId as string;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only delete items from your own restaurant' });
    return;
  }

  await prisma.menuItem.delete({ where: { id: itemId } });

  res.json({ message: 'Menu item deleted' });
}
