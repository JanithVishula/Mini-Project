PHASE 7 — Delivery Service
Goal: Build the service that assigns riders to orders and tracks deliveries. This introduces two new concepts: a service that reacts to another service's data, and the foundation for real-time location tracking.

The big picture

An order reaches status READY (food is ready)
        ↓
A RIDER sees available deliveries
        ↓
Rider accepts a delivery  →  gets assigned to that order
        ↓
Rider updates their location as they drive  (real-time tracking)
        ↓
Rider marks it DELIVERED  →  order is complete
What the service does

POST  /deliveries                  → create a delivery for an order (system/owner)
GET   /deliveries/available        → riders see unassigned deliveries (RIDER)
PATCH /deliveries/:id/accept       → rider accepts a delivery (RIDER)
PATCH /deliveries/:id/location     → rider updates GPS location (RIDER)
PATCH /deliveries/:id/status       → rider updates status (RIDER)
GET   /deliveries/:id              → track a specific delivery (anyone involved)
GET   /deliveries/my               → rider's own deliveries (RIDER)

--------------------------------

Step 1 — Initialize

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\delivery-service"
npm init -y

--------------------------------

Step 2 — Install dependencies

npm install express cors helmet dotenv jsonwebtoken @prisma/client @prisma/adapter-pg pg axios
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node @types/pg @types/jsonwebtoken prisma@7.8.0
Same proven stack. Note prisma@7.8.0 pinned exactly so we stay version-consistent.

--------------------------------

Step 3 — tsconfig.json
Create delivery-service/tsconfig.json:


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

--------------------------------

Step 4 — Create folders

mkdir src
mkdir src/routes
mkdir src/controllers
mkdir src/middleware

--------------------------------

Step 5 — Create the database

psql -U postgres

CREATE DATABASE quickbite_delivery;
\q

--------------------------------

Step 6 — .env
Create delivery-service/.env:


DATABASE_URL="postgresql://postgres:1234@localhost:5432/quickbite_delivery"
PORT=3004
JWT_SECRET="quickbite-super-secret-jwt-key-change-in-production"
ORDER_SERVICE_URL="http://localhost:3003"

--------------------------------

Step 7 — Initialize Prisma

npx prisma init

--------------------------------

Step 8 — prisma.config.ts
Remember the Prisma 7 rule. Create delivery-service/prisma.config.ts:


import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"]! },
});

--------------------------------

Step 9 — Define the data model
Open delivery-service/prisma/schema.prisma. Delete the url line that prisma init generated (Prisma 7 rule), then replace everything with:


generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Delivery {
  id             String         @id @default(uuid())
  orderId        String         @unique
  customerId     String
  restaurantId   String
  riderId        String?
  status         DeliveryStatus @default(PENDING)
  pickupAddress  String
  deliveryAddress String
  currentLat     Float?
  currentLng     Float?
  assignedAt     DateTime?
  deliveredAt    DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
}

enum DeliveryStatus {
  PENDING
  ASSIGNED
  PICKED_UP
  IN_TRANSIT
  DELIVERED
}
New concepts:

orderId String @unique — one delivery per order. @unique stops two deliveries being created for the same order.

riderId String? — optional (?) because when a delivery is first created, no rider is assigned yet. It's null until a rider accepts it.

currentLat, currentLng — the rider's live GPS coordinates. These update as the rider moves. This is the location tracking data. Optional because there's no location until the rider starts moving.

assignedAt, deliveredAt — timestamps for when key events happened. Useful for analytics later ("average delivery time").

--------------------------------

Step 10 — Migrate and generate

npx prisma migrate dev --name init
npx prisma generate

--------------------------------

Step 11 — src/prisma.ts
The locked Prisma 7 pattern:


import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export default prisma;

--------------------------------

Step 12 — Auth middleware
Create delivery-service/src/middleware/auth.middleware.ts — identical to the others:


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

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

--------------------------------

Step 13 — The delivery controller
Create delivery-service/src/controllers/delivery.controller.ts:


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
Key concepts:

The race condition guard in acceptDelivery: Two riders might try to accept the same delivery at the same moment. We check if (delivery.riderId) — if someone already grabbed it, the second rider gets 409 Conflict. This is a simplified version of handling concurrency. (A fully bulletproof version uses a database transaction, which you'll learn later.)

--------------------------------

2) How the race condition is checked
First — what is a race condition?

Two riders open the app and both see the same available delivery. Both tap "Accept" at nearly the same instant. Two requests hit your server almost simultaneously, both trying to claim the same delivery.


Time →
Rider A:  accept delivery 5  ──┐
Rider B:  accept delivery 5  ──┤  both arrive ~same time
                               ▼
                        who gets it?
Without protection, both could be assigned, and now two riders show up for one order. That's the race condition — the outcome depends on timing.

How our code guards against it

const delivery = await prisma.delivery.findUnique({ where: { id } });

if (delivery.riderId) {                          // ← the guard
  res.status(409).json({ error: 'Delivery already assigned to another rider' });
  return;
}

const updated = await prisma.delivery.update({
  where: { id },
  data: { riderId: req.user!.userId, status: 'ASSIGNED', ... }
});
The check is: "does this delivery already have a riderId? If yes, reject."


Rider A's request:
  1. read delivery → riderId is null → guard passes
  2. update → set riderId = A
  → success ✓

Rider B's request (arrives slightly after A finished):
  1. read delivery → riderId is now "A" → guard fails
  2. return 409 Conflict
  → rejected, B is told it's taken ✓
The 409 Conflict status code specifically means "this can't be done because the resource is in a conflicting state" — perfect for "already taken."

The honest caveat (and why I flagged it as "simplified")
This check is not fully bulletproof. There's a tiny window where it can still fail:


Rider A: reads delivery → riderId null ✓
Rider B: reads delivery → riderId null ✓   ← B read BEFORE A wrote!
Rider A: writes riderId = A
Rider B: writes riderId = B  ← overwrites A!
If both reads happen before either write, both pass the guard. This is the classic "check-then-act" race that databases solve with transactions or atomic conditional updates:


// the bulletproof version (for later) — one atomic operation
await prisma.delivery.updateMany({
  where: { id, riderId: null },   // only update IF still unassigned
  data: { riderId: req.user!.userId, status: 'ASSIGNED' }
});
// if 0 rows updated → someone else got it
This does the check and the write as one indivisible database operation, so there's no window between them. We'll cover transactions properly when we do testing/edge cases — for now, the simple guard is enough to understand the concept of a race condition and why you guard against it.

The takeaway
A race condition is when two requests compete over the same data and the result depends on timing. You guard against it by checking state before acting — and for true safety, making the check-and-act a single atomic database operation.

-----------------------------------

new Date() for timestamps: When a rider accepts, we record assignedAt: new Date(). When delivered, deliveredAt: new Date(). These capture the exact moment events happen.

Conditional timestamp: deliveredAt: status === 'DELIVERED' ? new Date() : delivery.deliveredAt — only set the delivered time if the new status is DELIVERED; otherwise keep the existing value. This is a ternary operator doing conditional logic inline.

----------------------------------

Step 14 — Routes
Create delivery-service/src/routes/delivery.routes.ts:


import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  createDelivery,
  getAvailableDeliveries,
  acceptDelivery,
  updateLocation,
  updateDeliveryStatus,
  getDeliveryById,
  getMyDeliveries
} from '../controllers/delivery.controller';

const router = Router();

router.post('/', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), createDelivery);

router.get('/available', authenticateToken, requireRole('RIDER'), getAvailableDeliveries);

router.get('/my', authenticateToken, requireRole('RIDER'), getMyDeliveries);

router.patch('/:id/accept', authenticateToken, requireRole('RIDER'), acceptDelivery);

router.patch('/:id/location', authenticateToken, requireRole('RIDER'), updateLocation);

router.patch('/:id/status', authenticateToken, requireRole('RIDER'), updateDeliveryStatus);

router.get('/:id', authenticateToken, getDeliveryById);

export default router;

Important — route ORDER matters here. 

Notice /available and /my come before /:id. If /:id came first, a request to /deliveries/available would match /:id with id = "available" — wrong! 

Express matches top to bottom, so specific routes must come before the dynamic /:id catch-all. This is a subtle bug that trips up many developers.

--------------------------------

1) Why route ORDER matters (the order of the code , /available route
is coded above the  /id route lines)

The key fact: Express checks routes from top to bottom and stops at the FIRST match.

Now look at these two routes:

router.get('/available', ...)   // specific — matches exactly "/available"
router.get('/:id', ...)         // dynamic — matches ANYTHING, putting it into "id"

The :id part is a wildcard. It matches literally any text in that position:

/deliveries/abc-123 → id = "abc-123" ✓
/deliveries/hello → id = "hello" ✓
/deliveries/available → id = "available" ← uh oh

So /:id will happily match /available too, treating the word "available" as if it were an ID.

What happens with the WRONG order

router.get('/:id', getDeliveryById)              // ← this comes first
router.get('/available', getAvailableDeliveries) // ← never reached
Request comes in: GET /deliveries/available

Express checks route 1: /:id   → "does this match? YES, id = 'available'"
                               → STOPS HERE, runs getDeliveryById
                               → tries to find a delivery with id "available"
                               → 404 Not Found  ← BUG!

Express never even looks at route 2 (/available)
The customer wanted the list of available deliveries, but got a 404 because /:id grabbed the request first and tried to look up a delivery whose ID is literally "available."

What happens with the RIGHT order

router.get('/available', getAvailableDeliveries) // ← specific FIRST
router.get('/:id', getDeliveryById)              // ← wildcard LAST
Request: GET /deliveries/available

Express checks route 1: /available  → "exact match? YES"
                                    → runs getAvailableDeliveries ✓
Request: GET /deliveries/abc-123

Express checks route 1: /available  → "exact match for 'abc-123'? NO"
Express checks route 2: /:id        → "match? YES, id = 'abc-123'"
                                    → runs getDeliveryById ✓
The rule
Always put specific/literal routes BEFORE dynamic /:param routes. The wildcard is greedy — it matches everything — so it must come last, acting as the catch-all.

Think of it like a series of filters: put the fine sieves first, the "catch everything" net last.

-----------------------------------

Step 15 — src/index.ts
Create delivery-service/src/index.ts:


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
Step 16 — Scripts in package.json

"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
Step 17 — Test
You'll need a RIDER account. Register one in auth-service:


{
  "email": "rider@test.com",
  "password": "password123",
  "name": "Test Rider",
  "role": "RIDER"
}
Start delivery-service:


npm run dev
Test 1 — Create a delivery (as RESTAURANT_OWNER):

POST http://localhost:3004/deliveries
Header: Authorization: Bearer <owner_token>
Body (use a real orderId from Phase 6, or any string for testing):

{
  "orderId": "<an order id>",
  "customerId": "<customer id>",
  "restaurantId": "<restaurant id>",
  "pickupAddress": "123 Main Street",
  "deliveryAddress": "456 Customer Lane"
}
Test 2 — See available deliveries (as RIDER):

GET http://localhost:3004/deliveries/available
Header: Authorization: Bearer <rider_token>
Test 3 — Accept a delivery (as RIDER):

PATCH http://localhost:3004/deliveries/<delivery_id>/accept
Header: Authorization: Bearer <rider_token>
Should set status to ASSIGNED and assign you as rider
Test 4 — Update location (as RIDER):

PATCH http://localhost:3004/deliveries/<delivery_id>/location
Header: Authorization: Bearer <rider_token>
Body: { "lat": 6.9271, "lng": 79.8612 }
Test 5 — Mark delivered (as RIDER):

PATCH http://localhost:3004/deliveries/<delivery_id>/status
Header: Authorization: Bearer <rider_token>
Body: { "status": "DELIVERED" }