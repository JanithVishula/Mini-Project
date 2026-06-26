import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

export async function getMyNotifications(req: AuthRequest, res: Response) {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.user!.userId },
    orderBy: { createdAt: 'desc' }
  });
  res.json(notifications);
}

export async function markAsRead(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) {
    res.status(404).json({ error: 'Notification not found' });
    return;
  }
  if (notification.userId !== req.user!.userId) {
    res.status(403).json({ error: 'Not your notification' });
    return;
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true }
  });
  res.json(updated);
}

