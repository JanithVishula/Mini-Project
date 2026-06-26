import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ message: 'Protected route works', user: req.user });
});

export default router;
