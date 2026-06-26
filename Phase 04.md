In programming, a callback is a piece of executable code passed as an argument to another piece of code. It is designed to run after the outer function finishes executing its task

-----------------------------------------

PHASE 4 — Authentication: Register, Login, JWT
Goal: Build two real API endpoints — POST /auth/register and POST /auth/login. Users can create accounts and log in. Login returns a JWT token the frontend will use for every future request.

-----------------------------------------

The concept first — how auth works in this system

REGISTER:
User sends email + password
→ we hash the password (never store plain text)
→ save user to database
→ return success

LOGIN:
User sends email + password
→ find user in database by email
→ compare password against the stored hash
→ if match → generate JWT token → return it
→ if no match → return 401 Unauthorized

EVERY OTHER REQUEST (later):
User sends request + JWT token in header
→ API Gateway checks the token with auth-service
→ valid → allow request
→ invalid/missing → block request
What is a JWT?
JWT = JSON Web Token. It's a string that looks like this:


eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJhYmMxMjMiLCJyb2xlIjoiQ1VTVE9NRVIifQ.xK9Lk2mN
Three parts separated by dots — each is Base64 encoded:


HEADER.PAYLOAD.SIGNATURE

Header:    { "alg": "HS256" }
Payload:   { "userId": "abc123", "role": "CUSTOMER", "exp": 1234567890 }
Signature: HMACSHA256(header + payload + SECRET_KEY)
The payload is NOT encrypted — anyone can decode it. But the signature IS verified. Without the secret key on your server, nobody can create a valid token. So the client can read the payload but cannot fake or modify it.

-----------------------------------------
Why JWT instead of sessions?

Sessions store data on the server — every service would need to check the same session store. JWT is self-contained — any service can verify it just by knowing the secret key. Perfect for microservices.

-----------------------------------------

Step 1 — Install auth dependencies

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\auth-service"
npm install bcryptjs jsonwebtoken
npm install --save-dev @types/bcryptjs @types/jsonwebtoken
bcryptjs — hashes passwords. Hashing is one-way: "mypassword" → "$2b$10$xK9...". You can never reverse it back. To verify, you hash the input again and compare hashes.

jsonwebtoken — creates and verifies JWT tokens.

-----------------------------------------

Step 2 — Create the folder structure
Inside auth-service/src/ create these folders:


mkdir src/routes
mkdir src/controllers
mkdir src/middleware
Your src/ structure will now be:


src/
├── routes/         ← defines URL paths and HTTP methods
├── controllers/    ← handles request logic
├── middleware/     ← functions that run before controllers
├── index.ts        ← server entry point
└── prisma.ts       ← database client

-----------------------------------------

Step 3 — Add environment variables
Open auth-service/.env and add these two lines:


DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quickbite_auth"
PORT=3001
JWT_SECRET="quickbite-super-secret-jwt-key-change-in-production"
JWT_EXPIRES_IN="7d"
JWT_SECRET — the secret key used to sign tokens. Anyone with this key can create valid tokens, so in production this is a long random string stored securely. Never commit the real one to git.

JWT_EXPIRES_IN — how long tokens are valid. "7d" = 7 days. After that the user must log in again.

-----------------------------------------

Step 4 — Create the auth controller
Create auth-service/src/controllers/auth.controller.ts:


import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

export async function register(req: Request, res: Response) {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password and name are required' });
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    res.status(409).json({ error: 'Email already in use' });
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name, role: role ?? 'CUSTOMER' }
  });

  res.status(201).json({
    message: 'User created successfully',
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' }
  );

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role }
  });
}

-----------------------------------------

Key decisions explained:

bcrypt.hash(password, 10) — the 10 is the salt rounds. Bcrypt runs the hashing algorithm 2^10 = 1024 times deliberately. This makes brute-force attacks slow — even if someone steals your database, cracking each password takes significant time.

prisma.user.findUnique({ where: { email } }) — checks if email already exists before creating. Without this, two users could register with the same email.

Why both cases return "Invalid credentials" instead of "User not found" or "Wrong password" separately? Security. If you say "user not found", attackers know which emails are registered. Keeping it vague reveals nothing.

jwt.sign({ userId, email, role }, secret, options) — creates the token. The payload includes role so other services know if the user is a CUSTOMER, RIDER, etc. without hitting the database again.

res.status(201) on register — HTTP 201 means "Created". 200 means "OK". When you create a new resource, 201 is the correct status code.

-----------------------------------------

Step 5 — Create the auth routes
Create auth-service/src/routes/auth.routes.ts:


import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;

-----------------------------------------

Why separate routes from controllers?

The route file only answers: "what URL maps to what function?"
The controller only answers: "what happens when that function runs?"

If you put both together, files get long and hard to read. Separated, each file has one job. When you add 10 more endpoints, you add 10 lines to routes and 10 functions to controllers — each file stays clean.

-----------------------------------------

Step 6 — Create the JWT middleware
Create auth-service/src/middleware/auth.middleware.ts:

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
      userId: string;
      email: string;
      role: string;
    };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

--------------------------------

What is middleware?

Middleware is a function that runs between the request arriving and the controller running. It can inspect, modify, or reject the request.

Request → middleware → middleware → controller → response

next() means "I'm done, pass the request to the next function in the chain." If you don't call next(), the request stops here — which is what happens when the token is missing or invalid.

authHeader.split(' ')[1] — tokens are sent in headers like:

Authorization: Bearer eyJhbGci...
Split by space gives ['Bearer', 'eyJhbGci...']. Index [1] is the actual token.

AuthRequest extends Request — we add a user property to the standard Express Request type. TypeScript doesn't know about req.user by default — this extends the type so it does.

-----------------------------------------

Step 7 — Add a protected profile route
Add this to auth-service/src/routes/auth.routes.ts — update the file to this:

import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ message: 'Protected route works', user: req.user });
});

export default router;

This is a protected route — it requires a valid JWT token. You'll use this pattern on every endpoint that requires a logged-in user. The authenticateToken middleware runs first — if the token is invalid it blocks the request before the controller even runs.

------------------------------------

Step 8 — Wire everything into index.ts
Replace everything in auth-service/src/index.ts with:


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

app.use('/auth', authRoutes) — mounts all routes from auth.routes.ts under the /auth prefix. So:

router.post('/register') becomes POST /auth/register
router.post('/login') becomes POST /auth/login
router.get('/profile') becomes GET /auth/profile

Step 9 — Test with Postman

Start your server:
npm run dev

Test 1 — Register a user:

Method: POST
URL: http://localhost:3001/auth/register
Body → JSON:

{
  "email": "customer@test.com",
  "password": "password123",
  "name": "Test Customer"
}
Expected response: 201 with user object (no password in response)

Test 2 — Login:

Method: POST
URL: http://localhost:3001/auth/login
Body → JSON:

{
  "email": "customer@test.com",
  "password": "password123"
}
Expected response: 200 with a token field

Test 3 — Hit the protected route:

Method: GET
URL: http://localhost:3001/auth/profile
Headers → add: Authorization: Bearer <paste the token from Test 2>
Expected response: 200 with your user info

Test 4 — Hit protected route without token:

Same as Test 3 but remove the Authorization header
Expected response: 401 Access token required

-------------------------------------

Now let's look at what are middleware and how that works here ?
Then about route.ts and index.ts overall view

-------------------------------------

Index.ts -> Middleware -> Route -> Controller -> Model (Prisma )

1) Who sends requests to index.ts?
Right now — your browser or Postman sends requests directly to port 3001.

Later — the API Gateway will be the one sending requests. The auth-service doesn't care who's calling it. It just receives HTTP requests on port 3001 and responds. Same code either way.

-----------------------------------------

2) What happens after index.ts receives a request?

First we will go through the index.ts code

Your reading of index.ts is exactly right

app.use(helmet());           // run on every request
app.use(cors());             // run on every request
app.use(express.json());     // run on every request

app.use('/auth', authRoutes); // if path starts with /auth → hand off to authRoutes
                              // authRoutes then matches the rest (/register, /login, /profile)

app.get('/health', ...);     // if exact path is /health → run this directly

app.listen(PORT, ...);       // start listening on port 3001

----------------------------------------

Exact order every time:

Request arrives at port 3001
        ↓
app.use(helmet())        ← global middleware 1
        ↓
app.use(cors())          ← global middleware 2
        ↓
app.use(express.json())  ← global middleware 3
        ↓
app.use('/auth', authRoutes)   ← router matches the path
        ↓
inside authRoutes — matches method + path
        ↓
any route-level middleware (like authenticateToken)
        ↓
controller function runs
        ↓
response sent back
Every single request goes through that exact chain top to bottom.

-----------------------------------------

3) Middleware — the full picture

Your instinct is right — it IS a middleman. Here's why you need it.

The problem without middleware:

Imagine you have 10 protected routes:

router.get('/profile', (req, res) => {
  // check token here
  // then do profile logic
});

router.get('/orders', (req, res) => {
  // check token here again
  // then do orders logic
});

router.get('/settings', (req, res) => {
  // check token here again
  // then do settings logic
});

You copy the token-checking code into every single route. 10 routes = 10 copies. When you need to change how token checking works, you update 10 places. Miss one — security hole.

With middleware:

router.get('/profile',  authenticateToken, profileController);
router.get('/orders',   authenticateToken, ordersController);
router.get('/settings', authenticateToken, settingsController);

Token checking lives in ONE place. Every route reuses it. Change it once, applies everywhere.

-----------------------------------------

What exactly does middleware do?

It can do any of these things:

1. INSPECT    — read headers, body, check if token exists
2. VALIDATE   — is this token valid? is this data the right format?
3. MODIFY     — attach data to req (like req.user = decoded token)
4. REJECT     — send 401/403 and stop the chain
5. PASS ON    — call next() and let the request continue

Your authenticateToken does all five:

// INSPECT — reads the Authorization header
const authHeader = req.headers['authorization'];

// VALIDATE — verifies the JWT signature
jwt.verify(token, process.env.JWT_SECRET!)

// MODIFY — attaches decoded user to req
req.user = decoded;

// PASS ON — continues to the controller
next();

// REJECT — if anything fails
res.status(401).json({ error: 'Access token required' });

-----------------------------------------

What is next function () ?

Express processes middleware as a chain. Each function in the chain must decide: continue or stop.

middleware1 → middleware2 → middleware3 → controller

next() = "I'm done, pass to the next function in the chain."
Not calling next() = "Stop here, I already sent a response."

function authenticateToken(req, res, next) {
  if (!token) {
    res.status(401).json({ error: 'no token' });
    return;          // ← stop. response already sent. next() never called.
  }

  req.user = decoded;
  next();            // ← continue. controller will run next.
}

If you called next() after sending a response, Express would try to send a second response — crash. That's why the return after res.status(401) is important.

-----------------------------------------

Why can't we do it all in one place?
You could. But you'd be writing this in every controller:

export async function getOrders(req, res) {
  // token check (copy-pasted)
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) { res.status(401).json({...}); return; }
  const decoded = jwt.verify(token, secret);
  // end of copy-pasted section

  // actual logic
  const orders = await prisma.order.findMany(...);
  res.json(orders);
}

Every controller becomes cluttered with the same repeated code. Middleware extracts that repeated part into one reusable function that slots into the chain wherever you need it.

The rule: controllers should only contain business logic. Everything else — auth checking, logging, validation, rate limiting — belongs in middleware.

-----------------------------------------

Do we need multiple middleware? (same middleware file but multiple middleware )

Yes, and you already have several:

app.use(helmet())         // security headers middleware
app.use(cors())           // cross-origin middleware
app.use(express.json())   // body parsing middleware
                          // (these three are built-in/third-party)

authenticateToken         // our custom auth middleware

Later we'll add more — like a middleware that validates the request body format before it reaches the controller, so the controller doesn't have to do that either.

Each middleware has one job. Stack them together and you get a powerful, clean pipeline.

-----------------------------------------

Why /register and /login skip middleware but /profile doesn't ? 

Think about who should be allowed to call each endpoint:

POST /register  → anyone, they don't have an account yet
POST /login     → anyone, they're trying to GET a token

GET  /profile   → only logged-in users, they must already have a token
/register and /login are public endpoints — no token needed, that's the whole point of them. Putting authenticateToken there would mean "you need to be logged in to log in" — makes no sense.

/profile is a protected endpoint — only makes sense if you're already logged in. So authenticateToken runs first to verify that.

router.post('/register', register);
// no middleware — anyone can reach register()

router.post('/login', login);
// no middleware — anyone can reach login()

router.get('/profile', authenticateToken, profileHandler);
// middleware first — only valid token holders reach profileHandler
The middleware is a gate. You put it only on doors that need a gate.

Later in this project every single endpoint except register/login will have that gate. Order endpoints, restaurant endpoints, delivery endpoints — all protected. You write authenticateToken once and reuse it everywhere.

-----------------------------------------

Step 7 — Add a protected profile route
Add this to auth-service/src/routes/auth.routes.ts — update the file to this:

import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { Response } from 'express';

const router = Router();

router.post('/register', register);
router.post('/login', login);

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ message: 'Protected route works', user: req.user });
});

export default router;

This is a protected route — it requires a valid JWT token. 

You'll use this pattern on every endpoint that requires a logged-in user. The authenticateToken middleware runs first — if the token is invalid it blocks the request before the controller even runs.

-----------------------------------------

Routes — auth.routes.ts

const router = Router();
Creates a mini Express app that only handles routing. Think of it as a sub-section of your main app.

router.post('/register', register);
router.post('/login', login);

Two simple mappings — method + path → function. When POST /register arrives, call register. No middleware here because these are public endpoints — anyone can hit them.

router.get('/profile', authenticateToken, (req: AuthRequest, res: Response) => {
  res.json({ message: 'Protected route works', user: req.user });
});

This route has two functions after the path — authenticateToken and then the actual handler. Express runs them in order left to right:

Request arrives at GET /profile
        ↓
authenticateToken runs first
        ↓ (only if next() was called)
the profile handler runs
        ↓
response sent

If authenticateToken rejects (no token, bad token), the handler never runs. This is the middleware chain — you can stack as many middleware functions as you want before the final handler.

export default router;

Exports the whole router so index.ts can mount it.

--------------------------------

index.ts

const app = express();
Creates your Express application. This is the root object everything attaches to.


const PORT = process.env.PORT ?? 3001;
?? is the nullish coalescing operator — "use process.env.PORT if it exists, otherwise use 3001". In development .env sets PORT=3001. In Docker or production the environment provides a different value. The code never hardcodes the port.


app.use(helmet());
app.use(cors());
app.use(express.json());
These three run on every single request before any route handler. Order matters here — they must come before the routes. This is the global middleware chain.


app.use('/auth', authRoutes);
Mounts your router. Every route inside authRoutes gets /auth prepended:


router.post('/register') → POST /auth/register
router.post('/login')    → POST /auth/login
router.get('/profile')   → GET  /auth/profile

app.get('/health', (req, res) => { ... });
Health check sits directly on app, not inside any router — so it stays at /health with no prefix. Infrastructure tools hit this to check if the service is alive.


app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
Starts the server. The callback fires once on startup — just a confirmation log. After this line, the process stays alive indefinitely waiting for incoming requests.