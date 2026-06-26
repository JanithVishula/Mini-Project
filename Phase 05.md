PHASE 5 — Restaurant Service

Goal: Build a completely independent microservice that manages restaurants and their menu items. This is the first time you'll build a service from scratch on your own — the pattern is identical to auth-service.

The big picture of what this service does

Restaurant Owner can:
- Create a restaurant (POST /restaurants)
- Get all restaurants (GET /restaurants)
- Get one restaurant (GET /restaurants/:id)
- Update their restaurant (PUT /restaurants/:id)

Menu Items:
- Add a menu item to a restaurant (POST /restaurants/:id/menu)
- Get all menu items for a restaurant (GET /restaurants/:id/menu)
- Update a menu item (PUT /restaurants/:id/menu/:itemId)
- Delete a menu item (DELETE /restaurants/:id/menu/:itemId)

-----------------------------------------------

Step 1 — Initialize the service

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\restaurant-service"
npm init -y

-----------------------------------------------

Step 2 — Install dependencies

npm install express cors helmet dotenv @prisma/client @prisma/adapter-pg pg
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node @types/pg prisma
Same stack as auth-service — you know what each one does now.

-----------------------------------------------

Step 3 — Create tsconfig.json

Create restaurant-service/tsconfig.json:


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

-----------------------------------------------

Step 4 — Create folder structure

mkdir src
mkdir src/routes
mkdir src/controllers
mkdir src/middleware

-----------------------------------------------

Step 5 — Create .env
Create restaurant-service/.env:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quickbite_restaurants"
PORT=3002
AUTH_SERVICE_URL="http://localhost:3001"

New variable — AUTH_SERVICE_URL: This service needs to verify JWT tokens. Instead of duplicating the JWT logic, it will ask the auth-service to verify tokens. This is a core microservices pattern — each service has one job, others call it.

-----------------------------------------------

Step 6 — Create the database

In PowerShell:


psql -U postgres
Then:


CREATE DATABASE quickbite_restaurants;
\q

-----------------------------------------------

Step 7 — Initialize Prisma

npx prisma init

-----------------------------------------------

Step 8 — Create prisma.config.ts
Create restaurant-service/prisma.config.ts:


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

-----------------------------------------------

Step 9 — Define the data models
Open restaurant-service/prisma/schema.prisma and replace everything with:


generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Restaurant {
  id          String     @id @default(uuid())
  ownerId     String
  name        String
  description String?
  address     String
  phone       String
  imageUrl    String?
  isActive    Boolean    @default(true)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  menuItems   MenuItem[]
}

model MenuItem {
  id           String     @id @default(uuid())
  restaurantId String
  name         String
  description  String?
  price        Float
  category     String
  imageUrl     String?
  isAvailable  Boolean    @default(true)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
}

New concepts here:

description String? — the ? makes a field optional. A restaurant doesn't have to have a description. In SQL this becomes NULLable.

menuItems MenuItem[] — a restaurant has many menu items. This is a one-to-many relationship.

restaurant Restaurant @relation(fields: [restaurantId], references: [id]) — this is the other side of the relationship. A menu item belongs to one restaurant. restaurantId in MenuItem is a foreign key that points to id in Restaurant. PostgreSQL enforces this — you can't create a menu item for a restaurant that doesn't exist.

ownerId String — stores the user ID from auth-service. Notice we don't create a User model here — restaurant-service doesn't own user data. It just stores the ID and asks auth-service when it needs user details. Services never share tables.

-----------------------------------------------

Step 10 — Run the migration

npx prisma migrate dev --name init
npx prisma generate

-----------------------------------------------

Step 11 — Create src/prisma.ts
Create restaurant-service/src/prisma.ts:

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export default prisma;

-----------------------------------------------

Step 12 — Create the auth middleware
This service needs to protect its routes too. But instead of duplicating JWT verification, create restaurant-service/src/middleware/auth.middleware.ts:


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
New concept — requireRole:

authenticateToken only checks "are you logged in?" requireRole checks "are you the RIGHT type of user?"


// only RESTAURANT_OWNER can create a restaurant
router.post('/', authenticateToken, requireRole('RESTAURANT_OWNER'), createRestaurant);

// anyone logged in can view restaurants
router.get('/', authenticateToken, getRestaurants);
requireRole('RESTAURANT_OWNER', 'ADMIN') — accepts multiple roles. If the user's role is in that list, they pass. Otherwise 403.

Add JWT_SECRET to your .env:


DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quickbite_restaurants"
PORT=3002
AUTH_SERVICE_URL="http://localhost:3001"
JWT_SECRET="quickbite-super-secret-jwt-key-change-in-production"
Also install jsonwebtoken:


npm install jsonwebtoken
npm install --save-dev @types/jsonwebtoken

-----------------------------------------------

Step 13 — Create the restaurant controller
Create restaurant-service/src/controllers/restaurant.controller.ts:


import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

export async function createRestaurant(req: AuthRequest, res: Response) {
  const { name, description, address, phone, imageUrl } = req.body;

  if (!name || !address || !phone) {
    res.status(400).json({ error: 'Name, address and phone are required' });
    return;
  }

  const restaurant = await prisma.restaurant.create({
    data: {
      ownerId: req.user!.userId,
      name,
      description,
      address,
      phone,
      imageUrl
    }
  });

  res.status(201).json(restaurant);
}

export async function getRestaurants(req: AuthRequest, res: Response) {
  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    include: { menuItems: true }
  });

  res.json(restaurants);
}

export async function getRestaurantById(req: AuthRequest, res: Response) {
  const { id } = req.params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: { menuItems: true }
  });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  res.json(restaurant);
}

export async function updateRestaurant(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { name, description, address, phone, imageUrl, isActive } = req.body;

  const restaurant = await prisma.restaurant.findUnique({ where: { id } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only update your own restaurant' });
    return;
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data: { name, description, address, phone, imageUrl, isActive }
  });

  res.json(updated);
}
Key concept — req.params:

When your route is /restaurants/:id, the :id part is a URL parameter. If someone hits /restaurants/abc-123, then req.params.id = "abc-123". This is how you get dynamic values from URLs.

include: { menuItems: true } — tells Prisma to also fetch related menu items in the same query. Without this you'd get the restaurant but menuItems would be empty. This generates a SQL JOIN automatically.

Ownership check in updateRestaurant — before updating, we verify the restaurant's ownerId matches the logged-in user's ID. Without this, any restaurant owner could edit any other restaurant.

-----------------------------------------------

Step 14 — Create the menu item controller
Create restaurant-service/src/controllers/menu.controller.ts:


import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../prisma';

export async function addMenuItem(req: AuthRequest, res: Response) {
  const { id: restaurantId } = req.params;
  const { name, description, price, category, imageUrl } = req.body;

  if (!name || !price || !category) {
    res.status(400).json({ error: 'Name, price and category are required' });
    return;
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only add items to your own restaurant' });
    return;
  }

  const menuItem = await prisma.menuItem.create({
    data: { restaurantId, name, description, price, category, imageUrl }
  });

  res.status(201).json(menuItem);
}

export async function getMenuItems(req: AuthRequest, res: Response) {
  const { id: restaurantId } = req.params;

  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true }
  });

  res.json(menuItems);
}

export async function updateMenuItem(req: AuthRequest, res: Response) {
  const { id: restaurantId, itemId } = req.params;
  const { name, description, price, category, imageUrl, isAvailable } = req.body;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only update items in your own restaurant' });
    return;
  }

  const updated = await prisma.menuItem.update({
    where: { id: itemId },
    data: { name, description, price, category, imageUrl, isAvailable }
  });

  res.json(updated);
}

export async function deleteMenuItem(req: AuthRequest, res: Response) {
  const { id: restaurantId, itemId } = req.params;

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });

  if (!restaurant) {
    res.status(404).json({ error: 'Restaurant not found' });
    return;
  }

  if (restaurant.ownerId !== req.user!.userId) {
    res.status(403).json({ error: 'You can only delete items from your own restaurant' });
    return;
  }

  await prisma.menuItem.delete({ where: { id: itemId } });

  res.json({ message: 'Menu item deleted' });
}

-----------------------------------------------

Step 15 — Create the routes
Create restaurant-service/src/routes/restaurant.routes.ts:


import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import {
  createRestaurant,
  getRestaurants,
  getRestaurantById,
  updateRestaurant
} from '../controllers/restaurant.controller';
import {
  addMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem
} from '../controllers/menu.controller';

const router = Router();

// Restaurant routes
router.get('/', authenticateToken, getRestaurants);
router.post('/', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), createRestaurant);
router.get('/:id', authenticateToken, getRestaurantById);
router.put('/:id', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), updateRestaurant);

// Menu item routes
router.post('/:id/menu', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), addMenuItem);
router.get('/:id/menu', authenticateToken, getMenuItems);
router.put('/:id/menu/:itemId', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), updateMenuItem);
router.delete('/:id/menu/:itemId', authenticateToken, requireRole('RESTAURANT_OWNER', 'ADMIN'), deleteMenuItem);

export default router;

-- This is much important if you can notice in the code that , for the routes
we import the ROUTER of EXPRESS (our framework) then the middleware and controller
methods of this service

after that we create an instance of the router 

after that we define the routes, how each request should proceed

for instance , the first request under restaruant routes -> 

the router directs that request to authenticateToken middleware then 
the controller method

actually when the api gateway calls the service , index.ts of rest. service 
comes in and there is a code snippet saying that
if any req comes to index.ts first to use helmet - cors - express.json
then if that req is to endpoint  "/restaurants" then direct to restaurant routes after that the routes file directs it to middleware and controller logic

-----------------------------------------------

Step 17 — Add scripts to package.json
Open restaurant-service/package.json and update the scripts section:


"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}

-----------------------------------------------

Step 18 — Run and test
Start the service:


npm run dev
You should see: Restaurant service running on port 3002

Before testing — you need a RESTAURANT_OWNER account. Go to Postman and register a new user in auth-service:


{
  "email": "owner@test.com",
  "password": "password123",
  "name": "Restaurant Owner",
  "role": "RESTAURANT_OWNER"
}
Login with that account and copy the token.

Test 1 — Create a restaurant:

POST http://localhost:3002/restaurants
Header: Authorization: Bearer <owner_token>
Body:

{
  "name": "Burger Palace",
  "description": "Best burgers in town",
  "address": "123 Main Street",
  "phone": "555-0101"
}
Test 2 — Get all restaurants:

GET http://localhost:3002/restaurants
Header: Authorization: Bearer <any_token>
Test 3 — Add a menu item:

POST http://localhost:3002/restaurants/<restaurant_id>/menu
Header: Authorization: Bearer <owner_token>
Body:

{
  "name": "Classic Burger",
  "description": "Beef patty with lettuce and tomato",
  "price": 9.99,
  "category": "Burgers"
}
Test 4 — Try creating a restaurant with a CUSTOMER token:

Same as Test 1 but use the customer token from Phase 4
Expected: 403 Insufficient permissions

-----------------------------------------------
