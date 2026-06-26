PHASE 9 — API Gateway
Goal: Build the single front door for your entire system. Right now the frontend would need to know 5 different ports (3001–3005). After this phase, it knows one address (3000), and the gateway routes everything behind the scenes.

The problem the gateway solves
Right now, your system looks like this from the outside:


Frontend needs to know:
  auth         → localhost:3001
  restaurants  → localhost:3002
  orders       → localhost:3003
  delivery     → localhost:3004
  notifications→ localhost:3005

5 addresses to track, 5 places CORS must be configured, 5 places to secure.
With a gateway:


Frontend knows ONE address:
  everything → localhost:3000

Gateway routes internally:
  /api/auth/*          → 3001
  /api/restaurants/*   → 3002
  /api/orders/*        → 3003
  /api/delivery/*      → 3004
  /api/notifications/* → 3005
What a gateway gives you (this is the Kong concept from Phase 1)

1. Single entry point     → frontend knows one URL
2. Routing                → forwards each request to the right service
3. Centralized concerns   → rate limiting, logging, CORS in ONE place
4. Hides internal layout  → outside world never sees ports 3001-3005
Step 1 — Initialize

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\api-gateway"
npm init -y
Step 2 — Install dependencies

npm install express cors helmet dotenv http-proxy-middleware express-rate-limit
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node
New libraries:

http-proxy-middleware — the core tool. It forwards (proxies) incoming requests to other servers. This is what makes the gateway a gateway.
express-rate-limit — limits how many requests a client can make (prevents abuse/DoS).
Notice: no Prisma, no database. The gateway stores nothing. It only routes. It's a pure traffic director.

Step 3 — tsconfig.json
Create api-gateway/tsconfig.json:


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
Step 4 — Create folder

mkdir src
(No controllers/routes/middleware split needed — the gateway is small and config-driven.)

Step 5 — .env
Create api-gateway/.env:


PORT=3000
AUTH_SERVICE_URL=http://localhost:3001
RESTAURANT_SERVICE_URL=http://localhost:3002
ORDER_SERVICE_URL=http://localhost:3003
DELIVERY_SERVICE_URL=http://localhost:3004
NOTIFICATION_SERVICE_URL=http://localhost:3005
Why URLs in .env? In development these are localhost. In Docker (Phase 12), they become http://auth-service:3001 (container names). The code stays identical — only the env values change. This is exactly why we never hardcode addresses.

Step 6 — The gateway itself
Create api-gateway/src/index.ts:


import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

// Security headers
app.use(helmet());

// Allow the frontend to call the gateway
app.use(cors());

// Rate limiting — max 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use(limiter);

// Simple request logger — runs on every request
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// Gateway's own health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// --- ROUTING: forward each path prefix to the right service ---

app.use('/api/auth', createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '/auth' }
}));

app.use('/api/restaurants', createProxyMiddleware({
  target: process.env.RESTAURANT_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/restaurants': '/restaurants' }
}));

app.use('/api/orders', createProxyMiddleware({
  target: process.env.ORDER_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/orders': '/orders' }
}));

app.use('/api/delivery', createProxyMiddleware({
  target: process.env.DELIVERY_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/delivery': '/deliveries' }
}));

app.use('/api/notifications', createProxyMiddleware({
  target: process.env.NOTIFICATION_SERVICE_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/notifications': '/notifications' }
}));

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});
The key piece — createProxyMiddleware:


app.use('/api/auth', createProxyMiddleware({
  target: process.env.AUTH_SERVICE_URL,        // where to forward to
  changeOrigin: true,                          // rewrite the Host header to the target
  pathRewrite: { '^/api/auth': '/auth' }       // transform the path before forwarding
}));
When a request hits /api/auth/login:


1. Request arrives at gateway:  POST /api/auth/login
2. Matches the '/api/auth' rule
3. pathRewrite strips '/api/auth' → rewrites to '/auth/login'
4. Forwards to AUTH_SERVICE_URL (localhost:3001)
5. Final request: POST http://localhost:3001/auth/login
6. Auth-service responds → gateway passes the response straight back to the client
Why pathRewrite? The frontend uses /api/auth/login (nice, namespaced). But auth-service only knows /auth/login. The rewrite bridges the two — the outside world uses /api/..., internally it maps to each service's real path.

Note the /api/delivery → /deliveries rewrite — the external name is "delivery" (singular, cleaner) but the service's actual routes are /deliveries (plural). The gateway translates. This shows the gateway can present a different public API than the internal one.

Step 7 — Scripts
Add to api-gateway/package.json:


"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
Step 8 — Test the gateway
You need multiple services running. For a full test, start auth, restaurant, and the gateway:


# Terminal 1
cd auth-service ; npm run dev
# Terminal 2
cd restaurant-service ; npm run dev
# Terminal 3
cd api-gateway ; npm run dev
Now do everything through port 3000 instead of the individual ports:

Test 1 — Register through the gateway:

POST http://localhost:3000/api/auth/register
Body:

{ "email": "gateway@test.com", "password": "password123", "name": "Gateway Test" }
This hits the gateway → forwards to auth-service → you get the same response as before.
Watch the gateway terminal — you'll see your logger print the request.
Test 2 — Login through the gateway:

POST http://localhost:3000/api/auth/login
Get a token (same as hitting 3001 directly, but now via 3000).
Test 3 — Get restaurants through the gateway:

GET http://localhost:3000/api/restaurants
Header: Authorization: Bearer <token>
Gateway forwards to restaurant-service. The token passes through automatically.
Test 4 — Gateway's own health:

GET http://localhost:3000/health → the gateway responds itself (not forwarded).
Test 5 — Rate limiting:

Hit any endpoint rapidly 100+ times in a minute → you'll get 429 Too many requests.
The big picture now

                    ┌─────────────────────┐
   Postman/React ──▶│  API Gateway :3000   │
                    │  - logs every request │
                    │  - rate limits        │
                    │  - routes by path     │
                    └──────────┬───────────┘
              ┌────────────────┼──────────────┬──────────────┬─────────────┐
              ▼                ▼               ▼              ▼             ▼
        auth :3001     restaurant :3002   order :3003   delivery :3004  notif :3005
The frontend (Phase 11) will talk only to port 3000. It never needs to know the individual services exist. That's the gateway's whole job.

------------------------

What is a proxy?
A proxy is a middleman that forwards requests on behalf of someone else.


Without proxy:   You ──────────────→ Destination

With proxy:      You ──→ Proxy ──→ Destination
                          (forwards your request,
                           gets the reply,
                           hands it back to you)
The client talks to the proxy thinking it's the real thing. The proxy quietly passes the request to the actual destination, gets the response, and returns it. The client never knows there was a forwarding step.

Everyday analogy — a receptionist:


You call a company's main number (one number you know)
        ↓
Receptionist answers
        ↓
"I need the billing department" → receptionist transfers you internally
        ↓
You talk to billing — but you only ever dialed the ONE public number
The receptionist is a proxy. You don't need to know billing's direct extension. You call one number; they route you. Your API Gateway is exactly this receptionist for your services.

What is http-proxy-middleware?
It's the library that gives Express the ability to forward HTTP requests to another server. Without it, Express can only respond to requests itself. With it, Express can say "this request isn't for me — forward it to that other server and pass back whatever they reply."


createProxyMiddleware({
  target: 'http://localhost:3001',          // forward TO here
  pathRewrite: { '^/api/auth': '/auth' }     // reshape the path first
})
This turns your gateway into a forwarder. When a request matches /api/auth, instead of handling it, the gateway relays it to localhost:3001 and relays the answer back.

Your real question — how does the gateway figure out WHO to send it to?
This is the heart of it. The gateway decides based on the URL path. It's pattern matching, top to bottom — exactly like Express routing, which you already understand.


app.use('/api/auth',          ... target: 3001)   // path starts with /api/auth?         → 3001
app.use('/api/restaurants',   ... target: 3002)   // path starts with /api/restaurants?  → 3002
app.use('/api/orders',        ... target: 3003)   // path starts with /api/orders?       → 3003
app.use('/api/delivery',      ... target: 3004)   // path starts with /api/delivery?     → 3004
app.use('/api/notifications', ... target: 3005)   // path starts with /api/notifications?→ 3005
So the frontend doesn't "figure out" anything about services. It just sends to one address (port 3000) with a descriptive path. The gateway reads the path and decides where it goes:


Frontend sends:  POST http://localhost:3000/api/auth/login
                                            └──┬──┘
                                  gateway reads this prefix
                                            ↓
                          "starts with /api/auth → forward to 3001"
                                            ↓
                          rewrites path: /api/auth/login → /auth/login
                                            ↓
                          forwards: POST http://localhost:3001/auth/login
                                            ↓
                          auth-service replies → gateway hands reply back to frontend
The frontend's only knowledge: "send everything to port 3000, and use a path that describes what I want." It has zero awareness that 5 services exist. The path is the routing instruction, and the gateway is what interprets it.

Step by step, one request

1. Frontend:  fetch('http://localhost:3000/api/restaurants')
              → frontend knows ONLY port 3000

2. Gateway receives it, checks its rules top to bottom:
   /api/auth?          no
   /api/restaurants?   YES ✓  → target = localhost:3002

3. Gateway rewrites:  /api/restaurants → /restaurants

4. Gateway forwards:  GET http://localhost:3002/restaurants
   (acting as a CLIENT now — the "client hat" from before)

5. restaurant-service responds with the data

6. Gateway passes that exact response back to the frontend

7. Frontend gets its data — never knowing port 3002 was involved
Why this is powerful

The frontend is DECOUPLED from your internal structure:

- Move a service to a different port?   → change only the gateway's .env
- Split one service into two?            → change only the gateway's routing
- Rename internal paths?                 → gateway's pathRewrite hides it

The frontend code NEVER changes. It always just talks to port 3000.
This is exactly what Kong/NGINX/AWS API Gateway do in production — yours is a hand-built version so you understand the mechanism.

The one-line summary
A proxy is a middleman that forwards requests for you. http-proxy-middleware gives Express that forwarding power. The gateway decides where to forward by matching the URL path prefix — so the frontend only ever knows one address (port 3000) and a descriptive path; the gateway reads the path and routes accordingly