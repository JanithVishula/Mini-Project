PHASE 6 — Order Service
Goal: Build the service where customers place orders. This is the most interesting service yet because it must talk to another service (restaurant-service) to validate the order — your first real taste of inter-service communication.

The big picture

Customer places an order
        ↓
Order Service receives it
        ↓
Order Service CALLS Restaurant Service  ← "is this restaurant real? are these items valid?"
        ↓
Restaurant Service responds with menu data
        ↓
Order Service calculates the total, saves the order
        ↓
Returns the order with status PENDING
The new concept: services calling each other over HTTP. Order-service doesn't have a copy of the menu — it asks restaurant-service.

What the service does

POST   /orders              → place a new order (CUSTOMER)
GET    /orders              → get my orders (CUSTOMER) or all (ADMIN)
GET    /orders/:id          → get one order
PATCH  /orders/:id/status   → update order status (RESTAURANT_OWNER / RIDER)
PATCH  /orders/:id/cancel   → cancel an order (CUSTOMER)
The order lifecycle (a state machine)
An order moves through states in a strict order:


PENDING → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED
                                                              ↘ CANCELLED
Each status change is controlled — you can't jump from PENDING straight to DELIVERED. This is called a state machine, and it's a real-world concept you'll see everywhere (orders, payments, shipping).

Step 1 — Initialize the service

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\order-service"
npm init -y

-------------------------------------
Step 2 — Install dependencies

npm install express cors helmet dotenv jsonwebtoken @prisma/client @prisma/adapter-pg pg axios
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node @types/pg @types/jsonwebtoken prisma@7.8.0
Two new things:

axios — an HTTP client. This is how order-service will call restaurant-service. (Node has fetch built in too, but axios is cleaner and what most projects use.)

The important thing here is we need axios to call other services
This idea is in One Note API part - definitely go and visit

prisma@7.8.0 — pinned to the exact version so we don't repeat the version-mismatch bug from Phase 5.

-------------------------------------

Step 3 — Create tsconfig.json
Create order-service/tsconfig.json (same as before):


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

-------------------------------------

Step 4 — Create folders

mkdir src
mkdir src/routes
mkdir src/controllers
mkdir src/middleware
mkdir src/services

New folder — src/services: This holds code that talks to other microservices. Keeping inter-service calls separate from controllers keeps things clean.

-------------------------------------

Step 5 — Create the database

psql -U postgres

CREATE DATABASE quickbite_orders;
\q

-------------------------------------

Step 6 — Create .env
Create order-service/.env:

DATABASE_URL="postgresql://postgres:1234@localhost:5432/quickbite_orders"
PORT=3003
JWT_SECRET="quickbite-super-secret-jwt-key-change-in-production"
RESTAURANT_SERVICE_URL="http://localhost:3002"
Note: I used password 1234 to match your setup. RESTAURANT_SERVICE_URL is the address order-service will call.

-------------------------------------

Step 7 — Initialize Prisma

npx prisma init

-------------------------------------

Step 8 — Create prisma.config.ts
Create order-service/prisma.config.ts:


import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"]!,
  },
});

-------------------------------------

Step 9 — Define the data models
Open order-service/prisma/schema.prisma and replace everything:


generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Order {
  id           String      @id @default(uuid())
  customerId   String
  restaurantId String
  status       OrderStatus @default(PENDING)
  totalAmount  Float
  deliveryAddress String
  items        OrderItem[]
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
}

model OrderItem {
  id         String  @id @default(uuid())
  orderId    String
  menuItemId String
  name       String
  price      Float
  quantity   Int
  order      Order   @relation(fields: [orderId], references: [id])
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PREPARING
  READY
  OUT_FOR_DELIVERY
  DELIVERED
  CANCELLED
}
Concepts:

OrderItem — an order has many items (you order 2 burgers + 1 fries = 3 order items). One-to-many, same pattern as restaurant→menu.

Why store name and price IN the OrderItem when they already exist in restaurant-service's menu? 

Because prices change. If a burger was $9.99 when ordered, and the restaurant raises it to $11.99 next week, your order history must still show $9.99. We snapshot the price at order time. This is a critical real-world data modeling decision — never rely on another service's current data for historical records.


-------------------------------------

Step 10 — Migrate and generate

npx prisma migrate dev --name init
npx prisma generate

-------------------------------------

Step 11 — Create src/prisma.ts
Create order-service/src/prisma.ts (the proven pattern):


import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export default prisma;

-------------------------------------

Step 12 — Create the auth middleware
Create order-service/src/middleware/auth.middleware.ts — same as restaurant-service:


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

-------------------------------------

Step 13 — Create the inter-service client
This is the new, important part. Create order-service/src/services/restaurant.service.ts:


import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const RESTAURANT_SERVICE_URL = process.env.RESTAURANT_SERVICE_URL!;

export async function getRestaurantWithMenu(restaurantId: string, token: string) {
  try {
    const response = await axios.get(
      `${RESTAURANT_SERVICE_URL}/restaurants/${restaurantId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    return null;
  }
}
What's happening here:

axios.get(url, { headers }) — makes an HTTP GET request from order-service TO restaurant-service. This is one microservice calling another over the network.

headers: { Authorization: Bearer ${token} } — we forward the user's token. Restaurant-service's routes require auth, so order-service must pass along the same token the customer used. The token travels with the request.

catch → return null — if restaurant-service is down or the restaurant doesn't exist, we return null and the controller handles it gracefully. Inter-service calls can fail, so we always handle errors.

-------------------------------------
2) Inter-service client — why not use routes?
You're mixing up two directions. Let me separate them clearly using the two hats idea from before.


ROUTES  = SERVER hat = receiving INCOMING requests
          "someone is calling ME"

INTER-SERVICE CLIENT = CLIENT hat = sending OUTGOING requests
          "I am calling SOMEONE ELSE"
Routes (order.routes.ts) handle requests coming into order-service. But when order-service needs to call out to restaurant-service, it's not receiving a request — it's sending one. Routes can't send requests; they only receive them. For sending, you need an HTTP client (axios), which is what restaurant.service.ts wraps.

Your understanding of the flow is exactly right:


1. Request comes IN to order-service        → order.routes.ts → placeOrder controller
2. placeOrder needs menu data
3. It calls the inter-service client (axios) → goes OUT to restaurant-service
4. restaurant-service responds with menu     → comes BACK to the axios call
5. placeOrder continues with that data        → calculates total, saves order
6. placeOrder sends response back to the customer
So yes — mid-controller, it pauses, calls another service, gets the answer, then continues. The await keyword is what makes it "pause and wait for the response":


const restaurant = await getRestaurantWithMenu(restaurantId, token);
//    ↑ controller pauses HERE until restaurant-service replies, then continues
Why a separate services/ folder instead of putting axios directly in the controller? Same reason routes and controllers are separate — one job per file. The controller handles order logic; the service file handles "how to talk to restaurant-service." If restaurant-service's URL or API changes, you fix one file, not every controller.

-------------------------------------

Step 14 — Create the order controller
Create order-service/src/controllers/order.controller.ts:


import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';
import { getRestaurantWithMenu } from '../services/restaurant.service';

export async function placeOrder(req: AuthRequest, res: Response) {
  const { restaurantId, items, deliveryAddress } = req.body;
  const token = req.headers['authorization']!.split(' ')[1];

  if (!restaurantId || !items || items.length === 0 || !deliveryAddress) {
    res.status(400).json({ error: 'restaurantId, items and deliveryAddress are required' });
    return;
  }

  // Call restaurant-service to validate the restaurant and get real menu data
  const restaurant = await getRestaurantWithMenu(restaurantId, token);
  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found or unavailable' });
    return;
  }

  // Build order items from REAL menu data (never trust prices from the client)
  const orderItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const menuItem = restaurant.menuItems.find((m: any) => m.id === item.menuItemId);
    if (!menuItem) {
      res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
      return;
    }
    const quantity = item.quantity ?? 1;
    totalAmount += menuItem.price * quantity;
    orderItems.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity
    });
  }

  const order = await prisma.order.create({
    data: {
      customerId: req.user!.userId,
      restaurantId,
      deliveryAddress,
      totalAmount,
      items: { create: orderItems }
    },
    include: { items: true }
  });

  res.status(201).json(order);
}

export async function getOrders(req: AuthRequest, res: Response) {
  const where = req.user!.role === 'ADMIN' ? {} : { customerId: req.user!.userId };

  const orders = await prisma.order.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: 'desc' }
  });

  res.json(orders);
}

export async function getOrderById(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true }
  });

  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  res.json(order);
}

export async function updateOrderStatus(req: AuthRequest, res: Response) {
  const id = req.params.id as string;
  const { status } = req.body;

  const validStatuses = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status }
  });

  res.json(updated);
}

export async function cancelOrder(req: AuthRequest, res: Response) {
  const id = req.params.id as string;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }

  if (order.customerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only cancel your own orders' });
    return;
  }

  if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
    res.status(400).json({ error: 'Order can no longer be cancelled' });
    return;
  }

  const updated = await prisma.order.update({
    where: { id },
    data: { status: 'CANCELLED' }
  });

  res.json(updated);
}
The most important line in this whole phase:

totalAmount += menuItem.price * quantity;

We calculate the total using the price from restaurant-service, NOT a price sent by the client. If we trusted the client's price, a malicious user could send "price": 0.01 and order food for a penny. Never trust the client for anything involving money or permissions — always validate against the authoritative source.

-------------------------------------

3) Why totalAmount += menuItem.price * quantity is special
This is the single most important security concept in backend development: never trust the client.

Here's the attack it prevents. Imagine you trusted the price the customer sends:


// BAD — trusting the client's price
totalAmount += item.price * item.quantity;   // item.price comes from the request body
A normal customer sends:


{ "menuItemId": "burger", "price": 9.99, "quantity": 2 }
But a malicious customer opens the browser dev tools and sends:


{ "menuItemId": "burger", "price": 0.01, "quantity": 2 }
Your server would happily charge them 2 cents for two burgers. You've just been robbed.

The fix — ignore whatever price the client claims. Look up the real price from restaurant-service (the authoritative source) and use that:


// GOOD — using the real price from restaurant-service
const menuItem = restaurant.menuItems.find(m => m.id === item.menuItemId);
totalAmount += menuItem.price * quantity;   // menuItem.price is the REAL price
The client only gets to say what they want (menuItemId) and how many (quantity). It does not get to decide the price. The price always comes from the server's trusted data.

The principle generalizes to everything:


The client decides:   what item, how many, what address
The SERVER decides:   the price, the total, whether they're allowed, the order ID
Anything involving money, permissions, or identity must be determined by the server, never accepted from the client. This is the difference between a toy app and a real one.

-----------------------------------


Step 15 — Create the routes
Create order-service/src/routes/order.routes.ts:


import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  placeOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder
} from '../controllers/order.controller';

const router = Router();

router.post('/', authenticateToken, requireRole('CUSTOMER'), placeOrder);
router.get('/', authenticateToken, getOrders);
router.get('/:id', authenticateToken, getOrderById);
router.patch('/:id/status', authenticateToken, requireRole('RESTAURANT_OWNER', 'RIDER', 'ADMIN'), updateOrderStatus);
router.patch('/:id/cancel', authenticateToken, requireRole('CUSTOMER'), cancelOrder);

export default router;
New HTTP method — PATCH: Used for partial updates. PUT replaces a whole resource, PATCH changes one field. Updating just the status is a perfect PATCH use case.

-------------------------------------

4) PATCH — why and where in routes

router.patch('/:id/status', ..., updateOrderStatus);
router.patch('/:id/cancel', ..., cancelOrder);
PATCH is for partial updates — changing one or a few fields, not the whole resource.

The difference between PUT and PATCH:


PUT    = replace the ENTIRE resource
         "here is the complete new order, overwrite everything"

PATCH  = change PART of the resource
         "just change the status field, leave everything else alone"
Updating an order's status is a perfect PATCH case — you're only touching the status field. The customer, items, address, total all stay the same. So:


PATCH /orders/:id/status   → change just the status (PENDING → CONFIRMED)
PATCH /orders/:id/cancel   → change just the status to CANCELLED
If you used PUT here, the convention would imply you're sending the entire order object to replace the old one — which you're not. PATCH correctly signals "small targeted change."

The method conveys intent. Anyone reading your API sees PATCH /orders/:id/status and immediately knows "this tweaks one field" without reading the code.

--------------------------------

Step 16 — Create src/index.ts
Create order-service/src/index.ts:


import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import orderRoutes from './routes/order.routes';

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
});

-------------------------------------

Step 17 — Add scripts to package.json

"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}

-------------------------------------

Step 18 — Test (this needs TWO services running)
This is the key part — order-service calls restaurant-service, so both must be running.

Terminal 1 — start restaurant-service:


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\restaurant-service"
npm run dev
Terminal 2 — start order-service:


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\order-service"
npm run dev
Setup data first:

Login as your RESTAURANT_OWNER → create a restaurant → add a menu item. Copy the restaurantId and the menu item's id.
Login as a CUSTOMER → copy that token.

Test 1 — Place an order (as CUSTOMER):

POST http://localhost:3003/orders
Header: Authorization: Bearer <customer_token>
Body:

{
  "restaurantId": "<paste restaurant id>",
  "deliveryAddress": "456 Customer Lane",
  "items": [
    { "menuItemId": "<paste menu item id>", "quantity": 2 }
  ]
}
Expected: 201 with an order, totalAmount calculated automatically (price × 2), status PENDING.

Test 2 — Get my orders:

GET http://localhost:3003/orders
Header: Authorization: Bearer <customer_token>
Test 3 — Update status (as RESTAURANT_OWNER):

PATCH http://localhost:3003/orders/<order_id>/status
Header: Authorization: Bearer <owner_token>
Body: { "status": "CONFIRMED" }
Test 4 — Cancel order (as CUSTOMER):

PATCH http://localhost:3003/orders/<order_id>/cancel
Header: Authorization: Bearer <customer_token>

-------------------------------

1) What is dotenv?
dotenv is a small library that loads your .env file into process.env when your program starts.

Without it:


process.env.DATABASE_URL   // undefined — Node doesn't read .env on its own
With dotenv.config() at the top of your file:


import * as dotenv from 'dotenv';
dotenv.config();   // reads .env, loads every KEY=value into process.env

process.env.DATABASE_URL   // now works
Node.js does not automatically read .env files. dotenv is the bridge. That one dotenv.config() call reads the file and injects every variable so your code can use process.env.WHATEVER.

-------------------------------


