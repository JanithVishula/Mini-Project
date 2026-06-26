import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import orderRoutes from './routes/order.routes';

import { connectProducer } from './kafka/producer';


dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3003;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/orders', orderRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'order-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Order service running on port ${PORT}`);
  connectProducer().catch(err => console.error('Producer connect failed:', err));
});

