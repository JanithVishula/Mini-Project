PHASE 8 — Notification Service with Kafka (Event-Driven)
The architecture:


order-service (PRODUCER)              Kafka Broker            notification-service (CONSUMER)
        │                          (KRaft mode)                      │
   fires event ──────────→  topic: "order-events"  ──────────→  consumes event
   "ORDER_PLACED"             (durable queue)                    creates notification
   then continues                                                sends email (logged)

------------------------

Step 1 — Run Kafka in Docker (KRaft mode, single broker)
Create a file at the project root: Mini Project/docker-compose.kafka.yml

services:
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: quickbite-kafka
    ports:
      - "9092:9092"
    environment:
      # --- KRaft mode settings (no Zookeeper) ---
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:29093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:29093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"
    volumes:
      - kafka-data:/var/lib/kafka/data

volumes:
  kafka-data:
The KRaft-specific lines explained (connecting to what we discussed):

KAFKA_PROCESS_ROLES: broker,controller — this single node acts as both the message broker AND the controller (the role Zookeeper used to play). This is KRaft — Kafka managing its own metadata.
KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:29093 — the Raft quorum. With one node, it votes for itself. In production you'd have 3+ controllers voting via Raft.
CLUSTER_ID — a unique ID for this Kafka cluster (required in KRaft mode).
No Zookeeper service anywhere — exactly the simplification KRaft gives us.
KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092 — this is the address your KafkaJS clients connect to. Critical detail: your Node services run on the host (not in Docker yet), so they reach Kafka at localhost:9092.

-----------------------------

Step 2 — Start Kafka
From the project root:


docker compose -f docker-compose.kafka.yml up -d
-d runs it detached (in the background). Then verify it's healthy:


docker ps
docker logs quickbite-kafka --tail 20
You want to see Kafka start without errors. Give it ~15 seconds to fully boot. Tell me what docker ps shows before continuing — I want to confirm the broker is up before we write the producer/consumer code.

-----------------------
Step 3 — Set up notification-service base (Prisma + Express)
This is the same service skeleton as before. Do these in order:


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\notification-service"
npm init -y
npm install express cors helmet dotenv jsonwebtoken @prisma/client @prisma/adapter-pg pg kafkajs
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node @types/pg @types/jsonwebtoken prisma@7.8.0

New library: kafkajs — the Kafka client for Node. order-service will also need it.

kafkajs is the Node.js client library for Kafka — you installed it with npm install kafkajs. It lives in node_modules/kafkajs.


Kafka broker  =  the server (in your Docker container) that stores/serves messages
kafkajs       =  the JavaScript code your services use to TALK to that broker
The broker speaks a specific binary network protocol. You don't want to implement that protocol by hand. kafkajs does it for you — it gives you simple methods like producer.send() and consumer.run() that handle all the low-level network communication with the broker.

your code → kafkajs methods → (Kafka protocol over network) → broker
It's the same role axios plays for HTTP, or Prisma plays for the database: a library that wraps a complex protocol in friendly methods.


Create notification-service/tsconfig.json:


{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
Create folders:


mkdir src
mkdir src/controllers
mkdir src/routes
mkdir src/middleware
mkdir src/kafka

New folder src/kafka — holds all Kafka connection/consumer code, kept separate from HTTP code.

Create the database:


psql -U postgres

CREATE DATABASE quickbite_notifications;
\q

-----------------------

Step 4 — notification-service config files
Create notification-service/.env:


DATABASE_URL="postgresql://postgres:1234@localhost:5432/quickbite_notifications"
PORT=3005
JWT_SECRET="quickbite-super-secret-jwt-key-change-in-production"
KAFKA_BROKERS="localhost:9092"
KAFKA_CLIENT_ID="notification-service"
KAFKA_GROUP_ID="notification-group"

-----------------------

Kafka Group ID — what, why, where, how
What it is
A consumer group is a label that tells Kafka "these consumers belong together." Your group ID is set in .env:


KAFKA_GROUP_ID="notification-group"
And used here:


const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID! });
Why it exists — two critical jobs
Job A — Offset tracking (remembering how far you've read)

Kafka keeps a bookmark per group of how many messages that group has consumed. This bookmark is called the offset.


Topic "order-events":
  [msg0][msg1][msg2][msg3][msg4]
                      ▲
            notification-group's offset = "I've read up to msg2"
When notification-service restarts, it asks Kafka "where was my group?" and resumes from msg3 — it doesn't re-read msg0-2, and doesn't skip anything. This is exactly the durability you tested in Step 3 (kill consumer, events wait, restart, it catches up). The group ID is what makes that work — Kafka tracks progress by group.

-----------------------

Job B — Load balancing (splitting work across copies)

If you run 2 copies of notification-service with the same group ID, Kafka splits the topic's partitions between them — each copy handles half the messages. No message gets processed twice.


Same group ID, 2 consumers:
  Consumer A (notification-group) → handles partition 0
  Consumer B (notification-group) → handles partition 1
  → work is SHARED, each message processed once
But if they had different group IDs, each would get all messages (both process everything) — useful when two different services both care about the same events.


Different group IDs:
  notification-group → gets ALL events (makes notifications)
  analytics-group    → gets ALL events (records stats)
  → each group independently sees every message
Where & how
Where: set in .env, read in consumer.ts.
How you'd use it: one group per "thing that needs to react." Notifications = one group. If later you add an analytics service, give it a different group so it independently receives all events too.

-----------------------

Initialize Prisma:

npx prisma init
Create notification-service/prisma.config.ts:


import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"]! },
});
Open notification-service/prisma/schema.prisma, remove the url line, replace with:


generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Notification {
  id        String           @id @default(uuid())
  userId    String
  type      NotificationType
  title     String
  message   String
  isRead    Boolean          @default(false)
  metadata  String?
  createdAt DateTime         @default(now())
}

enum NotificationType {
  ORDER_PLACED
  ORDER_CONFIRMED
  ORDER_PREPARING
  ORDER_READY
  ORDER_OUT_FOR_DELIVERY
  ORDER_DELIVERED
  ORDER_CANCELLED
  DELIVERY_ASSIGNED
}
Migrate and generate:


npx prisma migrate dev --name init
npx prisma generate
Create notification-service/src/prisma.ts:


import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export default prisma;

--------------------------------



Create notification-service/src/eventMessages.ts:


export function buildNotification(type: string): { title: string; message: string } {
  switch (type) {
    case 'ORDER_PLACED':
      return { title: 'Order Placed', message: 'Your order has been placed successfully!' };
    case 'ORDER_CONFIRMED':
      return { title: 'Order Confirmed', message: 'The restaurant confirmed your order.' };
    case 'ORDER_PREPARING':
      return { title: 'Preparing', message: 'Your food is being prepared.' };
    case 'ORDER_READY':
      return { title: 'Ready', message: 'Your order is ready.' };
    case 'ORDER_OUT_FOR_DELIVERY':
      return { title: 'On the Way', message: 'Your order is out for delivery!' };
    case 'ORDER_DELIVERED':
      return { title: 'Delivered', message: 'Your order has been delivered. Enjoy!' };
    case 'ORDER_CANCELLED':
      return { title: 'Cancelled', message: 'Your order was cancelled.' };
    case 'DELIVERY_ASSIGNED':
      return { title: 'Rider Assigned', message: 'A rider has been assigned to your order.' };
    default:
      return { title: 'Notification', message: 'You have a new notification.' };
  }
}


1) Why eventMessages.ts is separate (and note: it IS inside src)

Small clarification first — eventMessages.ts is inside src/. It sits at src/eventMessages.ts, directly in the src root rather than in a subfolder. So it's not outside src — it just isn't in a sub-folder like controllers/ or kafka/.

Why its own file at all? It has a single, distinct job: translate an event type into human-readable text.


"ORDER_PLACED"  →  { title: "Order Placed", message: "Your order has been placed!" }
That mapping logic is pure data transformation — it touches no database, no Kafka, no HTTP. Keeping it alone means:

The consumer stays focused on "receive event → save notification," not cluttered with a giant switch statement.
To add/change wording for an event, you edit one obvious file.
It's easily testable in isolation (Phase 10 — you can unit-test it with no database needed).

It's in src/ root (not a subfolder) because it's a small standalone helper, not part of a category like routes/controllers. Both choices are fine; many projects would put it in a utils/ folder.



--------------------------------

Create notification-service/src/middleware/auth.middleware.ts:


import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';

dotenv.config();

export interface AuthRequest extends Request {
  user?: { userId: string; email: string; role: string };
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string; email: string; role: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

--------------------------------

Step 5 — The Kafka CONSUMER (notification-service)
This is the new, important part. Create notification-service/src/kafka/consumer.ts:


import { Kafka } from 'kafkajs';
import * as dotenv from 'dotenv';
import prisma from '../prisma';
import { buildNotification } from '../eventMessages';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID!,
  brokers: process.env.KAFKA_BROKERS!.split(',')
});

const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID! });

export async function startConsumer() {
  await consumer.connect();
  console.log('✅ Kafka consumer connected');

  await consumer.subscribe({ topic: 'order-events', fromBeginning: true });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      const event = JSON.parse(raw);
      const { userId, type, metadata } = event;

      const { title, message: text } = buildNotification(type);

      await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message: text,
          metadata: metadata ? JSON.stringify(metadata) : null
        }
      });

      console.log(`📨 [${type}] notification created for user ${userId}`);
      // In production: ALSO send a real email / push here
    }
  });
}
Line by line — the Kafka concepts:

new Kafka({ clientId, brokers }) — creates the connection config. brokers is the address of your Kafka cluster (localhost:9092). .split(',') because you could list multiple brokers.

kafka.consumer({ groupId }) — creates a consumer in a consumer group. The group ID matters: Kafka tracks how far each group has read in the topic. If notification-service restarts, it resumes from where it left off — it won't re-process old events or miss any. This is the durability you wanted from Kafka.

consumer.subscribe({ topic: 'order-events', fromBeginning: true }) — subscribe to the topic. fromBeginning: true means on first run it reads all existing messages; after that the group offset takes over.

consumer.run({ eachMessage }) — the core loop. For every message that arrives in the topic, this function runs. We parse the JSON, build the notification text, and save it. This runs continuously, reacting to events as they arrive.

The key insight: notification-service doesn't expose an endpoint for events anymore. It pulls events from Kafka. order-service has no idea notification-service exists — it just publishes to the topic. Total decoupling.


----------------------------

Groups belong to CONSUMERS
A consumer must belong to exactly one group:

kafka.consumer({ groupId: 'notification-group' });   // one group, required
You can't put one consumer in multiple groups. One consumer = one group.

So where does "multiple groups" come in?
It's about having multiple different consumers, each in its own group, all reading the same topic:


                    Topic: "order-events"  (in the broker)
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                       ▼
notification-group       analytics-group        audit-group
(notification-service)   (analytics-service)    (audit-service)
        │                     │                       │
  makes notifications    records statistics      logs for compliance

Each group gets a COMPLETE copy of every event, independently.
Three different services, three different groups, all consuming the same topic — each sees every event, fully independent of the others.

And "multiple consumers in the SAME group"?
That's the load-balancing case — running multiple copies of the same service to share work:


notification-group:
  ├── notification-service copy 1  → handles half the messages
  └── notification-service copy 2  → handles the other half

Same group → work is SPLIT, each message handled by only ONE copy.
The rule, cleanly stated

PRODUCERS:  publish to TOPICS. Know nothing about groups.

CONSUMERS:  each belongs to exactly ONE group.

SAME group, multiple consumers     → SPLIT the work (load balancing, each msg once)
DIFFERENT groups, same topic       → each group gets ALL messages (independent reactions)
For your project right now: one producer (order-service → topic order-events), one consumer in one group (notification-service in notification-group). Simple and correct. The multi-group power is there when you later add, say, an analytics service that also wants every order event.

----------------------------

Step 6 — notification routes + index (consumer starts with the server)
Create notification-service/src/controllers/notification.controller.ts:


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
Create notification-service/src/routes/notification.routes.ts:


import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { getMyNotifications, markAsRead } from '../controllers/notification.controller';

const router = Router();

router.get('/', authenticateToken, getMyNotifications);
router.patch('/:id/read', authenticateToken, markAsRead);

export default router;
Create notification-service/src/index.ts:


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
Add scripts to notification-service/package.json:


"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}

--------------------------------

Step 7 — Turn order-service into a PRODUCER

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\order-service"
npm install kafkajs
mkdir src/kafka
Add to order-service/.env:


KAFKA_BROKERS="localhost:9092"
KAFKA_CLIENT_ID="order-service"
Create order-service/src/kafka/producer.ts:


import { Kafka, Producer } from 'kafkajs';
import * as dotenv from 'dotenv';

dotenv.config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID!,
  brokers: process.env.KAFKA_BROKERS!.split(',')
});

const producer: Producer = kafka.producer();
let connected = false;

export async function connectProducer() {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('✅ Kafka producer connected');
  }
}

export async function publishEvent(userId: string, type: string, metadata?: any) {
  try {
    await producer.send({
      topic: 'order-events',
      messages: [
        { key: userId, value: JSON.stringify({ userId, type, metadata }) }
      ]
    });
    console.log(`📤 Published ${type} for user ${userId}`);
  } catch (err) {
    console.error('Failed to publish event:', err);
  }
}
Concepts:

kafka.producer() — creates a producer that sends messages to topics.

producer.send({ topic, messages }) — publishes to order-events. Each message has:

key: userId — Kafka uses the key to decide which partition. Same key → same partition → ordered. Putting userId as key means all events for one user stay in order.
value: JSON.stringify(...) — the actual payload. Kafka stores raw bytes, so we serialize our object to a JSON string.
Connect once at startup, reuse forever — that's why connectProducer() is separate and guarded by connected. Connecting is expensive; you do it once.


--------------------------------

the producer's only job is to hand the message to the broker. The broker's job is to store it. The producer does NOT store anything — it doesn't keep a copy, doesn't manage the topic. It throws the message over and the broker takes full responsibility for persisting it.


PRODUCER:  "here, broker, store this"   (hands it off, done)
BROKER:    writes it to disk under the topic, keeps it safe   (the storage owner)
This is exactly why Kafka is durable — the broker holds the data on disk, independent of whether the producer or consumer is alive. The producer can shut down right after sending; the message is safely in the broker. That's the whole point.

So to answer directly: the topic lives inside the broker, and the broker saves the message into it automatically when the producer sends. The producer never touches storage.

--------------------------------

Step 8 — Call the producer from order-service
In order-service/src/index.ts, import and connect the producer at startup. Add near the top:


import { connectProducer } from './kafka/producer';
And in the app.listen callback:


app.listen(PORT, () => {
  console.log(`Order service running on port ${PORT}`);
  connectProducer().catch(err => console.error('Producer connect failed:', err));
});
In order-service/src/controllers/order.controller.ts, import at top:


import { publishEvent } from '../kafka/producer';
Then add these calls (note: now publishEvent, replacing the old HTTP fireEvent idea):

In placeOrder, after prisma.order.create:

await publishEvent(order.customerId, 'ORDER_PLACED', { orderId: order.id });
In updateOrderStatus, after the update:

await publishEvent(updated.customerId, `ORDER_${status}`, { orderId: updated.id });
In cancelOrder, after cancelling:

await publishEvent(updated.customerId, 'ORDER_CANCELLED', { orderId: updated.id });

------------------------------

Your flow is exactly right — let me confirm it line by line, then clear up the two confusions in your questions.

Your flow — verified correct ✅

1. Customer orders
2. order-service saves order, then publishes event to Kafka topic    ✅
3. Kafka broker keeps the data under that topic (durably on disk)     ✅
4. notification-service consumer reads the data from that topic       ✅
5. Inside notification-service it builds the notification             ✅
6. Saved in DB — NOT sent back to Kafka                               ✅
7. Customer comes back, calls GET /notifications, sees the DB data    ✅

------------------------------

Step 9 — Test the durable event flow
Make sure Kafka is running (docker ps). Then:

Terminal 1 — notification-service (consumer):


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\notification-service"
npm run dev
Look for: ✅ Kafka consumer connected

Terminal 2 — order-service (producer):


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\order-service"
npm run dev
Look for: ✅ Kafka producer connected

Test 1 — Place an order (as CUSTOMER):

POST http://localhost:3003/orders (same body as Phase 6)
Order-service terminal: 📤 Published ORDER_PLACED ...
Notification-service terminal: 📨 [ORDER_PLACED] notification created ...
The event flowed through Kafka between two services!

Test 2 — Read notifications:

GET http://localhost:3005/notifications with customer token → see the notification.
Test 3 — The DURABILITY test (the Kafka payoff):

Stop notification-service (Ctrl+C in Terminal 1).
Place another order (or update status) in order-service. The event publishes to Kafka — but no consumer is running.
Restart notification-service.
Watch — it immediately processes the event it missed while it was down.
This is what HTTP couldn't do. With direct HTTP calls, an event sent while notification-service was down would be lost forever. With Kafka, the broker held it safely until the consumer came back. That durability is the entire reason Kafka exists.

------------------------------