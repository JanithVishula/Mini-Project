PHASE 1 — Project Structure & Tooling

Goal: Create the folder skeleton for all 5 services, initialize git properly, and set up the shared config files. 

No app code yet — just the professional foundation everything else will sit on

-----------------------------------------

Step 1 — Create the folder structure
Open PowerShell inside your Mini Project folder and run these commands one at a time:

mkdir api-gateway
mkdir auth-service
mkdir restaurant-service
mkdir order-service
mkdir delivery-service
mkdir notification-service

Why 6 folders for 5 services? The API Gateway is technically a service too — it's the front door that receives all requests from the browser and forwards them to the right service behind the scenes.

-----------------------------------------

Step 2 — Create the root .gitignore
Create a new file named .gitignore in the root of Mini Project (not inside any subfolder). Put this content in it:

# Dependencies - huge, always re-downloadable
node_modules/

# TypeScript compiled output
dist/
build/

# Environment variables - NEVER commit secrets
.env
.env.*
!.env.example

# Logs
*.log
npm-debug.log*

# OS junk
.DS_Store
Thumbs.db

Why .env.example is NOT ignored: Later each service will have a .env file with real secrets (passwords, API keys). We never commit those. But we commit a .env.example with fake placeholder values so other developers know what variables they need to set up. This is standard professional practice.

-----------------------------------------

Step 3 — Create a root README.md
Create a file named README.md in the root of Mini Project:

# QuickBite - Food Delivery Platform

A microservices-based food delivery application built with Node.js, TypeScript, PostgreSQL, Docker, and React.

## Services

| Service | Port | Description |
|---|---|---|
| api-gateway | 3000 | Routes all incoming requests to the right service |
| auth-service | 3001 | Handles register, login, JWT tokens |
| restaurant-service | 3002 | Restaurants and menu items |
| order-service | 3003 | Placing and tracking orders |
| delivery-service | 3004 | Assigning riders, tracking deliveries |
| notification-service | 3005 | Emails and status notifications |

## Tech Stack

- **Backend:** Node.js + TypeScript + Express
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** JWT (JSON Web Tokens)
- **Containerization:** Docker + docker-compose
- **CI/CD:** GitHub Actions
- **Frontend:** React + TypeScript

Why a README? Every real project has one. It's the first thing anyone reads on GitHub. It also helps you — the port table will save you a lot of confusion later when 6 servers are running at the same time.

-----------------------------------------

Step 4 — Initialize git and make your first commit

Run these in your terminal one at a time:

git init
git add .gitignore README.md
git commit -m "chore: initial project structure"
Why this commit message format? chore: is from a standard called Conventional Commits. It tells anyone reading the git history what kind of change it was — chore = housekeeping, feat = new feature, fix = bug fix. CI/CD pipelines and changelog tools can read these automatically. We'll use this format throughout.

I am done now , then Answer below questions 

-----------------------------------------

1) API Gateway — is it like Kong?

Yes, exactly the same concept. Kong, NGINX, AWS API Gateway — they're all production-grade API Gateways.

We're building a simple custom one in Express so you understand what's happening inside

Browser                API Gateway              Services
  │                        │
  │  GET /restaurants       │
  │ ──────────────────────▶ │
  │                         │  forwards to restaurant-service:3002
  │                         │ ──────────────────────────────────▶
  │                         │ ◀──────────────────────────────────
  │ ◀─────────────────────  │
The browser only ever knows about one address (port 3000). It has no idea 5 other services exist behind it. The gateway handles:

Routing — which service does this request belong to?
Auth checking — is this user logged in? (asks auth-service)
Rate limiting — is this user sending too many requests?

Kong/NGINX do the same thing but with years of production hardening, config files, plugins, dashboards. We build ours from scratch so you understand what those tools are actually doing.

-----------------------------------------

2) Log files / OS junk / Compiled Output?

Log files (*.log)
When your server crashes or has errors, Node.js writes a file like npm-debug.log. These are auto-generated, sometimes huge, and useless to other developers. No point committing them.

-----------------------------------------

OS junk (.DS_Store, Thumbs.db)

.DS_Store — Mac creates this invisibly in every folder to store icon positions. Means nothing on Windows.

Compiled output (dist/, build/)
TypeScript is not JavaScript. The browser and Node.js can't run .ts files directly. You run a compiler (tsc) that converts your TypeScript into plain JavaScript and puts it in a dist/ folder

That output is generated — anyone can recreate it by running the compiler. Committing generated files is like committing the output of a calculator instead of the formula.

You write:       src/server.ts      ← commit this
Compiler makes:  dist/server.js     ← don't commit this

-----------------------------------------

3) Ports, services, who listens, how it all connects
Yes — your mental model is correct:

One Frontend (React)
Six Backend services, each on its own port
Here's how it works end to end:

React App (browser, port 5173)
        │
        │  ALL requests go here
        ▼
API Gateway (port 3000)          ← the only address React knows
        │
        ├── /auth/*       ──▶  Auth Service        (port 3001)
        ├── /restaurants/* ──▶  Restaurant Service  (port 3002)
        ├── /orders/*      ──▶  Order Service       (port 3003)
        ├── /delivery/*    ──▶  Delivery Service    (port 3004)
        └── /notifications/──▶  Notification Service(port 3005)

-----------------------------------------

Who does the port matching?
The API Gateway does. Inside it you write rules like:

"if the path starts with /restaurants, forward this request to localhost:3002"
"if the path starts with /orders, forward to localhost:3003"
How does a service "listen"?

-----------------------------------------

Every Express server ends with one line:

app.listen(3002)

That tells the operating system: "reserve port 3002 for me, and hand me every network packet that arrives on it." The OS keeps a table of which program owns which port. 

If two programs try to claim the same port, the second one crashes with EADDRINUSE — you'll see this eventually and now you'll know why.

-----------------------------------------

In production (Docker) each service runs in its own container and the ports are mapped explicitly. We'll cover that in Phase 12.

-----------------------------------------
Whose ports are these btw ? 

(server has different ports , when the front end requests some data or give some http request to api gateway , it tells to go to the relevant port of the server , which is here is localhost)