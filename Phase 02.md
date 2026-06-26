PHASE 2 — Auth Service: TypeScript + Express Server

Goal: Go inside auth-service, set it up as a proper TypeScript Node.js project, and get a real Express server running that responds to a browser request.

-----------------------------------------

Step 1 — Initialize the project inside auth-service

Open your terminal, navigate into the auth-service folder, and run:

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\auth-service"
npm init -y

What this does: Creates a package.json inside auth-service. The -y flag skips the questionnaire and accepts defaults. This file tracks your dependencies and scripts for this service only.

-----------------------------------------

Step 2 — Install dependencies
Run these two commands:

npm install express cors helmet
npm install --save-dev typescript ts-node nodemon @types/express @types/cors @types/node

-----------------------------------------

Why two separate commands?

npm install = production dependencies — code that runs in the live app:

express — the web framework (handles HTTP requests/responses)
cors — allows the React frontend (different port) to talk to this server
helmet — sets security HTTP headers automatically (protects against common attacks)
npm install --save-dev = dev dependencies — tools you only need while developing, not in production:

-----------------------------------------

typescript — the TypeScript compiler
ts-node — runs .ts files directly without compiling first (used in development)
nodemon — watches your files and auto-restarts the server when you save changes
@types/express, @types/cors, @types/node — TypeScript type definitions for these libraries (TypeScript needs to know what shape express functions have)

-----------------------------------------

Step 3 — Create the TypeScript config
Create a new file inside auth-service named tsconfig.json:


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


Key settings explained:

"rootDir": "./src" — all your TypeScript source files live in a src folder
"outDir": "./dist" — compiled JavaScript goes into dist (which we gitignore)
"strict": true — enables all strict type checks. This catches bugs at compile time instead of runtime. Always use this.
"target": "ES2020" — which version of JavaScript to compile down to
Step 4 — Create the folder structure inside auth-service
Run:

-----------------------------------------

mkdir src
Your auth-service folder should now look like this:

auth-service/
├── src/              ← all your TypeScript code goes here
├── node_modules/     ← installed by npm (don't touch)
├── package.json      ← your dependencies and scripts
└── tsconfig.json     ← TypeScript configuration

-----------------------------------------

Step 5 — Create your first real server file
Create a file at auth-service/src/index.ts:

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});

-----------------------------------------

Line by line explanation:

app.use(helmet()) — runs helmet on every request. Adds security headers like X-Content-Type-Options, X-Frame-Options automatically.

app.use(cors()) — allows requests from other origins (like your React app on port 5173). Without this, browsers block cross-port requests.

app.use(express.json()) — tells Express to automatically parse incoming request bodies that are JSON. Without this, req.body is always empty.

app.get('/health', ...) — a health check endpoint. Every microservice has one. The API Gateway (and later Docker/CI) pings this to know if the service is alive. Returns a simple JSON response.

app.listen(PORT, callback) — registers port 3001 with Windows and starts accepting connections. The callback fires once to confirm it started.

-----------------------------------------

Step 6 — Add npm scripts
Open auth-service/package.json and replace the "scripts" section with this:

"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
},

What each script does:

npm run dev — development mode. nodemon watches for file changes, ts-node runs TypeScript directly. You use this while building.
npm run build — compiles TypeScript → JavaScript into dist/. You use this before deploying.
npm start — runs the compiled JavaScript. Used in production/Docker (fast, no TypeScript overhead).

-----------------------------------------

Step 7 — Run it and test it
Start the server:

npm run dev
You should see:

Auth service running on port 3001
Now open your browser and go to:

http://localhost:3001/health

You should see:

{
  "status": "ok",
  "service": "auth-service",
  "timestamp": "2026-06-23T..."
}

That's a real API endpoint responding to a real HTTP request. This is the foundation every other endpoint is built on

-----------------------------------------

1) What does npm init -y do exactly?

It creates a package.json file by asking npm to generate one with default values (-y = "yes to everything"). Without -y it asks you questions interactively.

The file it creates tracks:

What your project is (name, version, description)
What dependencies it needs (express, cors, etc.)
How to run it (scripts)
Think of it as the identity card + instruction manual for this Node.js project. npm reads it to know what to install and how to run things.

-----------------------------------------

2) Node modules inside each microservice — is that okay?

Yes, and it's intentional and correct. This is one of the most important microservices concepts.


Mini Project/
├── auth-service/
│   └── node_modules/     ← auth-service's own dependencies
├── restaurant-service/
│   └── node_modules/     ← restaurant-service's own dependencies
├── order-service/
│   └── node_modules/     ← order-service's own dependencies
Why not one shared root node_modules?

Each service is an independent deployable program. In production, auth-service runs on one server, order-service on another. They can't share a folder. So we keep them independent from day one — same structure in development as in production.

Also, services can use different versions of the same library without conflict. auth-service might use express@4, order-service might use express@5. If they shared node_modules, one would overwrite the other.

-----------------------------------------

3) tsconfig.json — do all services need one?

Yes, every service needs its own tsconfig.json. But your description isn't quite right — let me clarify what each file actually controls:


tsconfig.json    → rules for the TypeScript COMPILER
                   (what to check, where source is, where output goes)

package.json     → rules for npm
                   (what libraries to install, how to run the app)
tsconfig.json doesn't control how the service behaves at runtime — it controls how TypeScript checks and compiles your code. Think of it as the rulebook for the compiler, not the app.

Each service gets its own because each has its own src/ and dist/ folders.

-----------------------------------------

4) package-lock.json — what is it and why?

package.json says: "I need express version ^5.2.1" (the ^ means "5.2.1 or any compatible newer version").

That's intentionally flexible — but flexibility causes a problem:

You install today → get express 5.2.1
Your teammate installs next month → gets express 5.2.4
Same package.json, different actual code → bugs that only happen on one machine
package-lock.json solves this. It records the exact version of every package installed, including dependencies of dependencies:


package.json      → "I want express ^5.2.1"       (intention)
package-lock.json → "installed express 5.2.1 exactly" (reality, locked)
When someone runs npm install with a package-lock.json present, npm installs the exact same versions every time. This is why you commit package-lock.json to git but not node_modules.

-----------------------------------------

5) Helmet, CORS, express.json

helmet

HTTP responses carry headers — small pieces of metadata. By default, Express sets none of the security ones. Helmet automatically adds headers like:


X-Frame-Options: DENY          ← prevents your site being embedded in iframes (clickjacking)
X-Content-Type-Options: nosniff ← prevents browsers guessing file types
Strict-Transport-Security: ...  ← forces HTTPS
One line of code, several attacks blocked.

-----------------------------------------

cors

Browsers have a security rule: JavaScript on localhost:5173 (React) is not allowed to make requests to localhost:3001 (your API) unless the API explicitly says "I allow that origin."

-----------------------------------------

This is called the Same-Origin Policy. cors middleware adds the header that grants that permission:

Access-Control-Allow-Origin: http://localhost:5173
Without this, your React app gets blocked by the browser even though both are on your own machine.

express.json()

When React sends data to your API (like a login form), it sends it as JSON in the request body:


{ "email": "user@test.com", "password": "abc123" }
Express doesn't parse that automatically. express.json() reads the raw bytes, parses them, and puts the result in req.body so you can do:


const { email, password } = req.body;
Without it, req.body is undefined.

-----------------------------------------
6) /api/health endpoint — how does it fit in?

Small correction first — the endpoint is /health not /api/health (we'll add the /api prefix later via the gateway).

Your mental model of how endpoints work is correct:

Frontend → API Gateway → routes to service → hits the right endpoint

But /health is special — it's not called by the frontend. It's called by infrastructure:

API Gateway  → GET /health  → "is auth-service alive?" → yes/no
Docker       → GET /health  → "should I restart this container?" 
CI/CD        → GET /health  → "did the deployment succeed?"
It's a diagnostic tool, not a user-facing feature. Every microservice exposes one so the system can monitor itself. A real health check later might also check if the database connection is alive.


-----------------------------------------

The health check route, line by line

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });
});

app.get — register a handler for HTTP GET requests. 

app.get = GET, 
app.post = POST, 
app.put = PUT, 
app.delete = DELETE. 

The HTTP method tells the server what kind of action the client wants to do.

'/health' — the URL path this handler responds to. When a request arrives at localhost:3001/health, Express matches it to this handler. Any other path gets no response (404).

(req, res) => { } — a function Express calls automatically when a matching request arrives. It receives two objects:


req  (request)  → everything ABOUT the incoming request
                  req.body    = the JSON data sent by the client
                  req.params  = URL parameters like /users/:id
                  req.headers = HTTP headers sent by the client

res  (response) → tools to send something BACK to the client
                  res.json()   = send JSON
                  res.send()   = send plain text
                  res.status() = set the HTTP status code
res.json({ ... }) — sends a JSON response back to whoever made the request. 

Express automatically sets the Content-Type: application/json header so the client knows what it received.

new Date().toISOString() — current date and time in standard format: 
"2026-06-24T10:30:00.000Z". Useful in health checks so you can see exactly when you hit the endpoint.

So the full flow when you visit localhost:3001/health:

Browser sends:   GET /health
Express matches: "I have a handler for GET /health"
Handler runs:    builds the JSON object
Express sends:   HTTP 200 response with that JSON
Browser shows:   { "status": "ok", "service": "auth-service", ... }

-----------------------------------------
How this request type and all the things around work ?


The server defines what it accepts. The client decides what it sends.

In your server code:

app.get('/health', (req, res) => {
app.get means — "I will only respond to GET requests on this path."

If someone sends a POST to /health, Express ignores it and returns 404. The server is the one setting the rule.

Who sends the request and how?
It depends on the situation. There are multiple possible clients:

Your browser (right now)
When you type localhost:3001/health in the address bar and press Enter, the browser automatically sends a GET request. Browsers always send GET when you type a URL directly. That's why it worked.

The frontend (React)
The React code would explicitly say what method to use:


fetch('http://localhost:3001/health')
// fetch defaults to GET if you don't specify
or explicitly:


fetch('http://localhost:3001/health', { method: 'GET' })
The API Gateway
It would call this programmatically:


fetch('http://localhost:3001/health', { method: 'GET' })
Tools like Postman / Thunder Client
You manually pick GET/POST/PUT/DELETE and send it. Very useful for testing API endpoints without needing a frontend.

The rule of thumb for which method to use
What you want to do	Method
Read / fetch data	GET
Create something new	POST
Update something fully	PUT
Update one field	PATCH
Delete something	DELETE
Health check = reading status = GET. That's why app.get was the right choice.

The full picture

Server (you define):    app.get('/health', ...)
                              ↑
                        "I accept GET here"

Client (browser/React/Postman):   sends GET /health
                                         ↑
                              "I am requesting a read"

They match → handler runs → response sent back
They don't match → 404
The server and client have to agree on the method. The server declares what it accepts, the client must send the matching type. Neither one works alone.

----------------------------------------------

7) Why scripts in package.json if you still type them?
Good challenge. Here's the real reason — scripts are shortcuts for long commands.

Without scripts, to run your server in dev mode you'd type:


nodemon --exec ts-node --project tsconfig.json src/index.ts
Every. Single. Time. And every developer on your team would need to know this exact command.

With a script:


npm run dev
That's it. The full command lives in package.json once, and everyone uses the short name.

The deeper reason — standardization across all services:

Every service in your project uses the same three scripts: dev, build, start. When your CI/CD pipeline runs (Phase 13), it doesn't need to know anything specific about each service — it just runs npm run build and npm start on every folder. Same command, works everywhere.


tsconfig.json  → tells TypeScript how to compile your code
package.json   → tells npm what commands exist and what libraries to use
They control different things. You need both.

-----------------------------------------
Scripts 

What actually happens in each mode (each script)

-----------------------------------------
Production (npm start)

You write          Compiler runs        Node.js runs
src/index.ts  →   tsc (TypeScript)  →  dist/index.js
               compiles to plain JS    actual execution

Two separate steps. You compile first, then run the output.

-----------------------------------------

Development (npm run dev)

nodemon watches src/index.ts for changes
        │
        └── when file saves, runs: ts-node src/index.ts
                                         │
                              ts-node does BOTH steps internally:
                              1. compiles .ts to JS in memory
                              2. immediately runs it
                              (no dist/ file written to disk)

ts-node is a convenience tool — it compiles and runs in one shot, in memory, so you don't have to manually run tsc every time you change something. nodemon wraps around it so the whole thing restarts automatically every time you save a file

-----------------------------------------

npm run build

"build": "tsc"
When: When you're done developing and want to prepare the code for production or Docker.

What happens:

tsc (TypeScript compiler) reads your tsconfig.json for rules
It checks every .ts file in src/ for type errors
If no errors, it converts every .ts file to plain .js
Writes the output into dist/

src/index.ts      →     dist/index.js
src/routes/auth.ts →    dist/routes/auth.js
If there are type errors, it tells you exactly which file and line. Nothing gets written to dist/ until your code is clean.

-----------------------------------------

If you used plain JavaScript instead of TypeScript
You would remove everything TypeScript-related:

No tsconfig.json
No @types/* packages
No ts-node
No tsc compiler
Your file would be index.js instead of index.ts and your script would be:


"dev": "nodemon src/index.js",
"start": "node src/index.js"
Node.js runs .js directly — no compilation step at all. Simpler, but you lose all the safety nets. No type checking means bugs that TypeScript would catch at compile time only show up at runtime — when real users hit them.

JavaScript:   you find out something is wrong when it crashes
TypeScript:   you find out something is wrong when you save the file
That's the entire reason TypeScript exists.