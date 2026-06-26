import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
