import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

// Create a delivery (called when an order is ready)
export async function createDelivery(req: AuthRequest, res: Response) {
  const { orderId, customerId, restaurantId, pickupAddress, deliveryAddress } = req.body;

  if (!orderId || !customerId || !restaurantId || !pickupAddress || !deliveryAddress) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const existing = await prisma.delivery.findUnique({ where: { orderId } });
  if (existing) {
    res.status(409).json({ error: 'Delivery already exists for this order' });
    return;
  }

  const delivery = await prisma.delivery.create({
    data: { orderId, customerId, restaurantId, pickupAddress, deliveryAddress }
  });

  res.status(201).json(delivery);
}

// Riders see all unassigned deliveries
export async function getAvailableDeliveries(req: AuthRequest, res: Response) {
  const deliveries = await prisma.delivery.findMany({
    where: { status: 'PENDING', riderId: null },
    orderBy: { createdAt: 'asc' }
  });

  res.json(deliveries);
}

// Rider accepts a delivery
export async function acceptDelivery(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const delivery = await prisma.delivery.findUnique({ where: { id } });
  if (!delivery) {
    res.status(404).json({ error: 'Delivery not found' });
    return;
  }

  if (delivery.riderId) {
    res.status(409).json({ error: 'Delivery already assigned to another rider' });
    return;
  }

  const updated = await prisma.delivery.update({
    where: { id },
    data: {
      riderId: req.user!.userId,
      status: 'ASSIGNED',
      assignedAt: new Date()
    }
  });

  res.json(updated);
}

// Rider updates their GPS location
export async function updateLocation(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { lat, lng } = req.body;

  if (lat === undefined || lng === undefined) {
    res.status(400).json({ error: 'lat and lng are required' });
    return;
  }

  const delivery = await prisma.delivery.findUnique({ where: { id } });
  if (!delivery) {
    res.status(404).json({ error: 'Delivery not found' });
    return;
  }

  if (delivery.riderId !== req.user!.userId) {
    res.status(403).json({ error: 'You are not assigned to this delivery' });
    return;
  }

  const updated = await prisma.delivery.update({
    where: { id },
    data: { currentLat: lat, currentLng: lng }
  });

  res.json(updated);
}

// Rider updates delivery status
export async function updateDeliveryStatus(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { status } = req.body;

  const validStatuses = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const delivery = await prisma.delivery.findUnique({ where: { id } });
  if (!delivery) {
    res.status(404).json({ error: 'Delivery not found' });
    return;
  }

  if (delivery.riderId !== req.user!.userId) {
    res.status(403).json({ error: 'You are not assigned to this delivery' });
    return;
  }

  const updated = await prisma.delivery.update({
    where: { id },
    data: {
      status,
      deliveredAt: status === 'DELIVERED' ? new Date() : delivery.deliveredAt
    }
  });

  res.json(updated);
}

// Track a specific delivery
export async function getDeliveryById(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const delivery = await prisma.delivery.findUnique({ where: { id } });
  if (!delivery) {
    res.status(404).json({ error: 'Delivery not found' });
    return;
  }

  res.json(delivery);
}

// Rider's own deliveries
export async function getMyDeliveries(req: AuthRequest, res: Response) {
  const deliveries = await prisma.delivery.findMany({
    where: { riderId: req.user!.userId },
    orderBy: { createdAt: 'desc' }
  });

  res.json(deliveries);
}
