import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import restaurantRoutes from './routes/restaurant.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/restaurants', restaurantRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'restaurant-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Restaurant service running on port ${PORT}`);
});
