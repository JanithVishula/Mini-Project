
--------------------------------------------------------------------

PHASE 3 — Database Setup with PostgreSQL + Prisma

Goal: Install PostgreSQL, connect it to auth-service, and define your first data model (the Users table). No SQL written by hand — Prisma handles that.

First — what is a database in this context?

Your Express server handles requests but stores nothing. Every time you restart it, all data is gone. A database is a separate program that persists data to disk. Your service talks to it over a connection.

Auth Service (Node.js)  ←→  PostgreSQL (separate program, port 5432)
PostgreSQL is a separate process running on your machine, just like your Node server. It owns port 5432.

-----------------------------------------------------

What is Prisma? - Definitely Look at One Note ORM Note 

Prisma is an ORM — Object Relational Mapper. It sits between your TypeScript code and the database.

Without Prisma you write raw SQL:

SELECT * FROM users WHERE email = 'test@test.com';
With Prisma you write TypeScript:

await prisma.user.findUnique({ where: { email: 'test@test.com' } });
Prisma converts that TypeScript into SQL and sends it to PostgreSQL. You get full type safety — if you typo a field name, TypeScript catches it before you even run the code.

-----------------------------------------------------

Step 1 — Install PostgreSQL
Go to this link and download the installer for Windows:


https://www.postgresql.org/download/windows/
Click "Download the installer" → pick the latest version (16 or 17) → Windows x86-64.

Run the installer. During installation:

Password: set it to postgres (keep it simple for development)
Port: leave it as 5432
Stack Builder: uncheck it at the end (you don't need it)
After install, open a new PowerShell and verify:

psql --version
You should see something like psql (PostgreSQL) 16.x.

-----------------------------------------------------

When we write ,

python abc.py

kinda program , OS needs to send this to python interpreter but
that is not inside the same folder as abc.py

therefore OS needs to go find it , it's mentioned in this PATH 

OS searches there and find python interpreter and hands that python file to be executed

Since i installed postgresql in D -> i need to change where to look for postgresql 

-----------------------------------------------------

Step 2 — Create the database
In PowerShell, connect to PostgreSQL:
psql -U postgres

It will ask for the password you set (postgres). Then run this SQL command inside psql:

CREATE DATABASE quickbite_auth;

Then exit:
\q

Why a separate database per service?

Each microservice owns its own database. auth-service only talks to quickbite_auth. restaurant-service will later get quickbite_restaurants. This is a core microservices rule — services never share a database directly. If they did, a change in one service's table could silently break another service.

-----------------------------------------------------

Step 3 — Install Prisma in auth-service
Make sure you're in the auth-service folder:

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\auth-service"
Install Prisma:

npm install @prisma/client
npm install --save-dev prisma

Why two separate packages?

prisma — the CLI tool (dev only). You use it to create migrations, generate code. Not needed in production.
@prisma/client — the actual runtime client your code imports. This runs in production.

Initialize Prisma:

npx prisma init

This creates two things:

prisma/schema.prisma — where you define your data models
.env — where your database connection string goes

-----------------------------------------------------
1) What is schema.prisma exactly?
Your comparison to tsconfig.json is close but not quite right. Here's the difference:


tsconfig.json     → rules for the TypeScript COMPILER
                    "how should tsc behave?"

schema.prisma     → THREE things in one file:
                    1. how to connect to the database
                    2. what your database tables look like
                    3. what code Prisma should generate
So yes — it IS your model definitions. The model User { } block IS your User model. But it's also more than that. It's the single source of truth that drives everything:


schema.prisma
      │
      ├── generates SQL migrations  (the actual database tables)
      ├── generates Prisma Client   (the TypeScript types and query methods)
      └── defines the connection    (where is the database?)
In traditional MVC you'd have a separate user.model.ts file with query functions. With Prisma, the model shape is defined in schema.prisma, and Prisma generates all the query methods automatically. Your user.model.ts just calls those generated methods.

-----------------------------------------------------

Step 4 — Configure the database connection
Open the .env file that Prisma just created inside auth-service. Replace its contents with:

DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quickbite_auth"
PORT=3001

Breaking down the connection string:

postgresql://  postgres  :  1234  @  localhost  :  5432  /  quickbite_auth
   protocol    username     password     host          port     database name
Why .env and not hardcoded in the source file?

In production this would be:

postgresql://prod_user:s3cr3tP@$$w0rd@db.yourserver.com:5432/quickbite_auth

You never commit real passwords to git. The .env file is gitignored. Every environment (dev, staging, production) has its own .env with different values. The code stays the same — only the environment changes.

-----------------------------------------------------

Step 5 — Define your first data model
Open auth-service/prisma/schema.prisma. Replace everything in it with:

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String
  role      Role     @default(CUSTOMER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Role {
  CUSTOMER
  RESTAURANT_OWNER
  RIDER
  ADMIN
}

Every field explained:

id String @id @default(uuid()) — primary key. UUID (like a3f8c2d1-...) instead of auto-increment numbers. Why? With microservices, multiple services create records. If they all use 1, 2, 3... you get collisions. UUIDs are globally unique.

email String @unique — @unique tells PostgreSQL to create a unique index. Two users cannot have the same email. The database enforces this, not just your code.

password String — will store a hashed password, never the real one. We cover this in Phase 4.

role Role @default(CUSTOMER) — an enum. A user is one of four types. @default(CUSTOMER) means if you don't specify a role, they're a customer automatically.

createdAt DateTime @default(now()) — automatically set to current timestamp when a record is created. You never pass this manually.

updatedAt DateTime @updatedAt — automatically updated by Prisma every time the record changes.

-----------------------------------------------------

2) Did we create tables without SQL?
Yes, exactly. You wrote this in schema.prisma:


model User {
  id        String   @id @default(uuid())
  email     String   @unique
  ...
}
Prisma read that and generated this SQL automatically:


CREATE TABLE "User" (
    "id"        TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    ...
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
Then ran it against your database. You never touched SQL. The prisma/migrations/ folder has the generated SQL file — open it and you'll see exactly what Prisma ran on your behalf.

-----------------------------------------------------

Step 6 — Run the migration
A migration is Prisma reading your schema and creating the actual table in PostgreSQL.

npx prisma migrate dev --name init
What this does:

Connects to quickbite_auth database
Reads your schema.prisma
Generates a SQL file (stored in prisma/migrations/)
Runs that SQL against your database — creates the User table
Generates the Prisma Client (TypeScript types matching your schema)

You should see:

✔ Generated Prisma Client

-----------------------------------------------------

2) Error occured

Prisma schema loaded from prisma\schema.prisma.
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: The datasource property `url` is no longer supported in schema files. Move connection URLs for Migrate to `prisma.config.ts` and pass either `adapter` for a direct database connection or `accelerateUrl` for Accelerate to the `PrismaClient` constructor. See https://pris.ly/d/config-datasource and https://pris.ly/d/prisma7-client-config
  -->  prisma\schema.prisma:7
   | 
 6 |   provider = "postgresql"
 7 |   url      = env("DATABASE_URL")
   | 

Validation Error Count: 1
[Context: getConfig]

Prisma CLI Version : 7.8.0

-----------------------------------------------------

2) Fixing the Prisma 7 error
You have Prisma version 7 which changed how database connections are configured. The old url = env("DATABASE_URL") inside schema.prisma no longer works — it moved to a separate config file.

Here's exactly what to do:

Fix A — Update schema.prisma
Open auth-service/prisma/schema.prisma and replace the entire datasource block:

Remove this:


datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
Replace with this:


datasource db {
  provider = "postgresql"
}
Fix B — Create prisma.config.ts
Create a new file at auth-service/prisma.config.ts (in the root of auth-service, not inside the prisma/ folder):


import path from 'path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  earlyAccess: true,
  schema: path.join('prisma', 'schema.prisma'),
  migrate: {
    async adapter() {
      const { PrismaPg } = await import('@prisma/adapter-pg');
      const connectionString = process.env.DATABASE_URL!;
      return new PrismaPg({ connectionString });
    },
  },
});
Fix C — Install the new required packages

npm install @prisma/adapter-pg pg
npm install --save-dev @types/pg
Why these packages?
Prisma 7 uses a driver adapter pattern — instead of managing the database connection itself, it delegates to a dedicated PostgreSQL driver (pg). @prisma/adapter-pg is the bridge between Prisma and pg.

Fix D — Update .env
Make sure your auth-service/.env still has:


DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quickbite_auth"
PORT=3001
Fix E — Run the migration again

npx prisma migrate dev --name init

-----------------------------------------------------

Why keep the migration files?

The prisma/migrations/ folder is committed to git. It's the history of every database change ever made. When a new developer joins, they run npx prisma migrate dev and their database catches up to the current state automatically. Same concept as git for your database schema.

-----------------------------------------------------

3) What is a migration?
A migration is a recorded, versioned change to your database structure.

Think about this problem:

Day 1:  You create the User table
Day 5:  You add a "phoneNumber" column to User
Day 10: You add a new table called "Sessions"
Each of those changes is a migration. Prisma saves each one as a numbered SQL file:


prisma/migrations/
├── 20260624_001_init/
│   └── migration.sql        ← CREATE TABLE User
├── 20260629_002_add_phone/
│   └── migration.sql        ← ALTER TABLE User ADD COLUMN phoneNumber
└── 20260634_003_sessions/
    └── migration.sql        ← CREATE TABLE Sessions
Why this matters:

Your teammate clones the repo on Day 10. They run:


npx prisma migrate dev
Prisma runs all 3 migrations in order. Their database goes from empty to exactly the same state as yours — automatically. No manual SQL, no "hey can you send me the database dump?"

Same concept as git — git tracks changes to your code, migrations track changes to your database schema.

The word "migration" comes from "migrating" your database from one state to another. Each migration moves the structure forward one step.

-----------------------------------------------------

Step 7 — Verify the table was created
Connect to PostgreSQL and check:

psql -U postgres -d quickbite_auth
Then:

\dt
You should see the User table listed. Then:

\d "User"
This shows all columns and their types. Type \q to exit.

-----------------------------------------------------

Step 8 — Connect Prisma to your server

Create a new file at auth-service/src/prisma.ts:

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

export default prisma;

-----------------------------------------------------

Why a separate file?

PrismaClient opens a connection pool to the database. You want one instance shared across your entire application. If every file created its own new PrismaClient(), you'd open hundreds of database connections and crash PostgreSQL. One file creates it once, everyone imports from that file.

-----------------------------------------------------

4) What does "connecting Prisma to the server" mean?
Right now you have two separate things:


src/index.ts        ← your Express server (handles HTTP requests)
src/prisma.ts       ← your Prisma client (talks to the database)
They don't know about each other yet. "Connecting Prisma to the server" just means your route handlers will import and use the Prisma client to read/write data.

The file you created src/prisma.ts:


import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export default prisma;
Creates one shared database connection. Later when you write a register endpoint:


import prisma from '../prisma';     // ← this is the "connection"

app.post('/register', async (req, res) => {
  const user = await prisma.user.create({  // uses Prisma to write to DB
    data: { email, password, name }
  });
  res.json(user);
});
Your HTTP server and your database are now linked. A request comes in → controller runs → Prisma queries the database → response goes back.


HTTP Request
     ↓
Express (src/index.ts)
     ↓
imports and uses
     ↓
Prisma Client (src/prisma.ts)
     ↓
PostgreSQL database
Without that import, your server would handle requests but have nowhere to store or retrieve data.

--------------------------------

Where is the "create user" query?
It's in your controller:


const user = await prisma.user.create({
  data: { email, password: hashedPassword, name, role: role ?? 'CUSTOMER' }
});
That single line IS the query. Prisma takes it and silently generates this SQL:


INSERT INTO "User" ("id", "email", "password", "name", "role", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'test@test.com', '$2b$10$...', 'Test User', 'CUSTOMER', NOW(), NOW())
RETURNING "id", "email", "name", "role", "createdAt", "updatedAt";
You never see it, you never write it. Prisma writes it for you based on your schema.


--------------------------------

Every Prisma operation maps to a SQL query

// CREATE
prisma.user.create({ data: {...} })
→ INSERT INTO "User" (...) VALUES (...)

// READ ONE
prisma.user.findUnique({ where: { email } })
→ SELECT * FROM "User" WHERE email = '...' LIMIT 1

// READ MANY
prisma.user.findMany({ where: { role: 'CUSTOMER' } })
→ SELECT * FROM "User" WHERE role = 'CUSTOMER'

// UPDATE
prisma.user.update({ where: { id }, data: { name: 'New Name' } })
→ UPDATE "User" SET name = '...' WHERE id = '...'

// DELETE
prisma.user.delete({ where: { id } })
→ DELETE FROM "User" WHERE id = '...'

----------------------------------

Schema.prisma defines the shape (what columns exist).
Migrations create the actual table in PostgreSQL.
Controller code does the actual data operations using Prisma methods.

All three files work together — none of them alone is enough.