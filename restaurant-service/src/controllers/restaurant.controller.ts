import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

export async function createRestaurant(req: AuthRequest, res: Response) {
  const { name, description, address, phone, imageUrl } = req.body;

  if (!name || !address || !phone) {
    res.status(400).json({ error: 'Name, address and phone are required' });
    return;
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      ownerId: req.user!.userId,
      name,
      description,
      address,
      phone,
      imageUrl
    }
  });

  res.status(201).json(restaurant);
}

export async function getRestaurants(req: AuthRequest, res: Response) {
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    include: { menuItems: true }
  });

  res.json(restaurants);
}

export async function getRestaurantById(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: { menuItems: true }
  });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  res.json(restaurant);
}

export async function updateRestaurant(req: AuthRequest, res: Response) {
  const id = req.params.id as string;11

  const { name, description, address, phone, imageUrl, isActive } = req.body;

  const restaurant = await prisma.restaurant.findUnique({ where: { id } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only update your own restaurant' });
    return;
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data: { name, description, address, phone, imageUrl, isActive }
  });

  res.json(updated);
}
