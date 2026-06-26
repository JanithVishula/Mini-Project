import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import notificationRoutes from './routes/notification.routes';
import { startConsumer } from './kafka/consumer';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3005;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/notifications', notificationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Notification service running on port ${PORT}`);
  // Start the Kafka consumer when the server boots
  startConsumer().catch((err) => {
    console.error('Failed to start Kafka consumer:', err);
  });
});
