import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import deliveryRoutes from './routes/delivery.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3004;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/deliveries', deliveryRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'delivery-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Delivery service running on port ${PORT}`);
});
