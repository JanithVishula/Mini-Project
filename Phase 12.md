PHASE 12 — Dockerizing the Services
Goal: Package each of your 6 services into a Docker image, then run the entire system (services + Kafka + databases + Kong) with one command via a master docker-compose.yml. This removes the host.docker.internal workaround and makes everything reproducible.

What we're building toward

RIGHT NOW:
  - Services run via `npm run dev` on your host
  - Kafka in a container, Kong in containers, app DBs in native PostgreSQL
  - Mixed setup → host.docker.internal workarounds

AFTER PHASE 12:
  docker compose up   ← ONE command starts EVERYTHING:
     ├── postgres (one container, all app databases)
     ├── kafka
     ├── auth-service        (your image)
     ├── restaurant-service  (your image)
     ├── order-service       (your image)
     ├── delivery-service    (your image)
     ├── notification-service (your image)
     └── kong + kong-db
  All on one Docker network → they talk by name → no host.docker.internal
The concept first — what a Dockerfile does
A Dockerfile is the recipe to turn your service's code into an image. For a Node service, the recipe is:


1. Start FROM a base image that has Node already installed
2. COPY your package.json
3. RUN npm install  (install dependencies)
4. COPY your source code
5. Build it (TypeScript → JavaScript)
6. Define the command to START it (npm start)
Then docker build runs that recipe and produces an image. docker run starts a container from the image.

Step 1 — Write the first Dockerfile (auth-service)
We'll do auth-service first, understand it fully, then replicate the pattern.

Create auth-service/Dockerfile (no extension, exactly that name):


# ---- Stage 1: Build ----
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (for layer caching)
COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install ALL dependencies (including dev, needed to build)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy the rest of the source and build
COPY src ./src
RUN npm run build

# ---- Stage 2: Run ----
FROM node:22-alpine

WORKDIR /app

# Copy only what's needed to RUN (not dev dependencies)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the generated Prisma client and compiled output from the builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma

EXPOSE 3001

CMD ["node", "dist/index.js"]
This is a "multi-stage build" — a professional pattern. Let me explain every part:

Why two stages (builder and the final one)?


Stage 1 (builder):  has ALL tools — TypeScript compiler, dev dependencies.
                    Compiles your .ts → .js. Heavy, ~500MB.

Stage 2 (final):    has ONLY what's needed to RUN — no compiler, no dev deps.
                    Copies just the compiled dist/ from stage 1. Lean, ~150MB.
The final image is small and clean because it doesn't carry the build tools. This is how production Docker images are kept lightweight.

FROM node:22-alpine — base image with Node 22 pre-installed. alpine = a tiny Linux variant (~5MB base vs ~300MB). Smaller image, faster pulls.

WORKDIR /app — sets the working directory inside the container. All subsequent commands run here.

COPY package*.json ./ before COPY src — this ordering is deliberate, for layer caching:


Docker caches each step. If your package.json hasn't changed,
Docker reuses the cached `npm install` instead of re-running it.
Copying package.json BEFORE source means: editing code doesn't
re-trigger npm install. Big speed win on rebuilds.
RUN npm install --omit=dev (stage 2) — installs only production dependencies. The dev tools (typescript, nodemon, jest) aren't needed to run the compiled app.

EXPOSE 3001 — documents that this container listens on 3001. (Doesn't actually open the port — that's done in compose — but documents intent.)

CMD ["node", "dist/index.js"] — the command that runs when the container starts. Note: node dist/index.js, NOT npm run dev — production runs the compiled JS directly (your start script).

-----------------------------------

Multi-stage build — explained simply
Imagine baking a cake.


You need (to BAKE):     mixer, oven, flour, eggs, measuring cups, mess everywhere
You need (to SERVE):    just the finished cake on a plate

You don't serve the cake WITH the oven and dirty bowls attached.
A Docker image is the same. To build your app you need heavy tools (TypeScript compiler, all dev dependencies). To run it, you only need the finished JavaScript. You don't want to ship the heavy build tools in the final image.

Multi-stage = two kitchens:


STAGE 1 (the messy kitchen — "builder"):
  - Has everything: Node, TypeScript compiler, all dependencies
  - Compiles your .ts → .js
  - Result: a dist/ folder with finished JavaScript
  - This kitchen is BIG and messy (~500MB)

STAGE 2 (the serving plate — final image):
  - Starts fresh and clean
  - Takes ONLY the finished dist/ from stage 1
  - Installs ONLY production dependencies (no compiler)
  - Result: small, clean image (~150MB)
  - This is what actually runs
The magic line:


COPY --from=builder /app/dist ./dist
This means "grab the finished dist/ from the messy builder kitchen and put it on the clean serving plate." The build tools stay behind in stage 1 and get thrown away.

The benefit: your final image is small (faster to push/pull/deploy) and clean (no compiler, no dev tools = smaller attack surface). One Dockerfile, two stages, best of both.

-------------------------------

Step 2 — Create a .dockerignore
Create auth-service/.dockerignore:


node_modules
dist
.env
*.log
.git
Why? When Docker builds, it copies your folder into the build context. You do NOT want to copy node_modules (huge, and we reinstall inside the container) or .env (secrets — those come from compose, not baked into the image). This is the Docker equivalent of .gitignore.

-----------------------------------

Step 3 — Build and test this one image

cd "c:\Users\Admin\OneDrive\Desktop\Mini Project\auth-service"
docker build -t quickbite-auth-service .
What this does: runs the Dockerfile recipe, producing an image tagged quickbite-auth-service. The . means "use the Dockerfile in the current directory." First build is slow (downloads base image, installs deps); later builds are fast (caching).

Watch for it to finish with naming to ... quickbite-auth-service. Then verify the image exists:


docker images | Select-String "quickbite"

why don't we need node_modules / .env for the docker file ?
why they are written in docker compose not in  this docker file

node_modules — why NOT copied in
The Dockerfile creates node_modules inside the image by running npm install. So copying yours in would be pointless and harmful:


Your machine's node_modules:
  - Built for WINDOWS
  - Huge (hundreds of MB)
  - May have OS-specific binaries that DON'T work in Linux (the container is Linux!)

The Dockerfile instead:
  COPY package*.json ./      ← copy just the recipe of what to install
  RUN npm install            ← install FRESH, inside the Linux container
So node_modules isn't "written in compose" — it's generated inside the image by npm install. We .dockerignore your local one so Docker doesn't waste time copying a Windows-built folder that would just be overwritten (and could even break things if a stray binary survived).


node_modules:  not copied in, not in compose — it's BUILT inside the image
.env — this is the interesting one
.env is different. It's not generated — it's configuration with secrets. The key principle:

An image should be generic and contain NO secrets or environment-specific config. Config is injected at run time, not baked in at build time.

-----------------------------------

Why not bake .env into the image?

If you COPY .env into the image:
  ✗ Secrets (DB password, JWT secret) are now FROZEN inside the image
  ✗ Anyone who pulls the image from Docker Hub gets your secrets
  ✗ The image only works in ONE environment (can't reuse for dev/staging/prod)
  ✗ To change a password, you'd have to REBUILD the whole image
The right way — inject config at run time
The same image should run in dev, staging, and production — only the config differs:


ONE image: quickbite-auth-service
     │
     ├── run in DEV      → inject DATABASE_URL=...dev db,    JWT_SECRET=dev-secret
     ├── run in STAGING  → inject DATABASE_URL=...staging db, JWT_SECRET=staging-secret
     └── run in PROD     → inject DATABASE_URL=...prod db,    JWT_SECRET=real-secret
The image is generic. The environment provides the config when the container starts. That's why config goes in compose (or in production, in the cloud platform's secret manager) — at run time, not build time.

-----------------------------------

Where compose provides it
In the master docker-compose.yml (Step 5), you'll see something like:


auth-service:
  build: ./auth-service
  environment:
    DATABASE_URL: postgresql://postgres:1234@postgres:5432/quickbite_auth
    JWT_SECRET: quickbite-super-secret-jwt-key
    PORT: 3001
Those environment: values get injected into the container when it starts — they become process.env.DATABASE_URL etc., exactly as .env did during development. The code doesn't change at all (dotenv reads from process.env either way).

The clean mental model

                    BUILD TIME (Dockerfile)          RUN TIME (compose / cloud)
                    ─────────────────────            ──────────────────────────
node_modules    →   generated by `npm install`       (already in image)
                    inside the Linux image

.env / secrets  →   NOT included (image stays         injected as environment
                    generic, no secrets baked in)      variables when container starts

Two reasons, two answers:

node_modules → excluded because it's built fresh inside the image (and your Windows one wouldn't work in Linux anyway).
.env → excluded because secrets must never be baked into an image; config is injected at run time so one generic image works everywhere.
The underlying principle (worth memorizing)
Build a generic image once. Inject environment-specific config (and secrets) at run time.

This is one of the most important rules of containerization — it's why the same image you build can run on your laptop, in CI, and in production unchanged, with only the config differing. It also keeps secrets out of images (which often get pushed to public registries).

-----------------------------------

don't i need to push it to docker hub ?

Do you need to push right now? No.
Pushing to Docker Hub is for sharing an image — making it available to other machines (a teammate, a production server, a CI runner). You don't need it to run the image locally.


Image you just built  →  lives in YOUR local Docker
                          (run it locally with no push needed)

docker push           →  uploads it to Docker Hub
                          so OTHER machines can pull and run it
Right now everything runs on your one machine, so the local image is all you need. Compose (Step 5) will run your locally-built images directly — no Hub involved.

-----------------------------------

So when DO you push?
Two situations:


1. DEPLOYMENT — your production server (AWS/Render/etc.) needs the image.
   It can't see your laptop, so you push to Hub → the server pulls from Hub.

2. CI/CD (Phase 13) — this is where pushing becomes AUTOMATIC.
   GitHub Actions will: build the image → run tests → push to a registry
   → (optionally) the deploy step pulls and runs it.
That's the key insight: in a real workflow, you rarely push manually. Your CI/CD pipeline does it for you on every merge. So we'll wire up automated pushing in Phase 13 — doing it by hand now would just be throwaway practice.

The full lifecycle (where push fits)

LOCAL DEV (now):
  docker build → run locally via compose          ← no push needed

CI/CD (Phase 13):
  git push → GitHub Actions:
       builds image → tests → docker push to registry (automatic)

DEPLOYMENT:
  production server → docker pull from registry → docker run
Two notes for when we do push

1. Docker Hub vs other registries — Docker Hub is the default public one (docker.io). But you'll also see:

GitHub Container Registry (ghcr.io) — integrates perfectly with GitHub Actions, often the natural choice when your code is already on GitHub.
Cloud registries (AWS ECR, etc.) — when deploying to that cloud.
Since your CI is GitHub Actions, we'll likely push to ghcr.io in Phase 13 — no separate Docker Hub account needed, it uses your GitHub login.

2. The manual push command (so you know it) is:


docker tag quickbite-auth-service yourusername/quickbite-auth-service:latest
docker push yourusername/quickbite-auth-service:latest
But again — we'll automate this in CI rather than typing it.

----------------------------------------

Can't we run each Dockerfile manually without compose?
Yes, absolutely — and it's worth understanding why we don't.

You can run each container manually with docker run:


docker run -d -p 3001:3001 --env DATABASE_URL=... --env JWT_SECRET=... quickbite-auth-service
docker run -d -p 3002:3002 --env DATABASE_URL=... --env JWT_SECRET=... quickbite-restaurant-service
docker run -d -p 3003:3003 ... quickbite-order-service
docker run -d -p 3004:3004 ... quickbite-delivery-service
docker run -d -p 3005:3005 ... quickbite-notification-service
docker run -d -p 5432:5432 ... postgres
docker run -d ... kafka
docker run -d ... kong
... and create a shared network, and link them, and set the startup order
That's 9+ commands, each with many flags, every time you want to start the system. And you'd have to:

Create a shared network manually so they can talk
Pass every environment variable by hand
Remember the correct startup order (database before services)
Repeat it all exactly the same way each time
Compose solves this. It's the same thing, written once in a YAML file:


docker run × 9 with all flags    →    one docker-compose.yml file
                                       run with: docker compose up

WITHOUT compose:  9 long commands, manual network, manual env, manual ordering
WITH compose:     ONE file, ONE command (docker compose up), everything wired
So — manual docker run works, but it's tedious and error-prone for a multi-container system. Compose is just the organized, repeatable way to do the same thing. (Same reason you use npm scripts instead of typing long commands — convenience and consistency.)

------------------------------

And also since we have KONG and a custom built API GATEWAY , we will 
dockerize only API GATEWAY

For a production-shaped project, Kong is the gateway. The custom one served its purpose (you learned routing, proxying, rate limiting by hand). Keep its code as a portfolio artifact — "I built my own, understood the internals, then adopted Kong" is a great story to tell — but don't run it in the live stack.

So for Phase 12:

DON'T dockerize api-gateway  ← skip it
DO dockerize the 5 services
USE Kong as the single front door (port 8000)
This means: skip building the api-gateway image. You don't need its Dockerfile. Just build the 5 service images:


cd "c:\Users\Admin\OneDrive\Desktop\Mini Project"
docker build -t quickbite-restaurant-service ./restaurant-service
docker build -t quickbite-order-service ./order-service
docker build -t quickbite-delivery-service ./delivery-service
docker build -t quickbite-notification-service ./notification-service

------------------------------


================================================================================
                    PHASE 12 — CONCEPTS & KNOWLEDGE REFERENCE
================================================================================

This section collects everything we discussed during Phase 12 — the concepts
you should understand, cleanly ordered. Implementation steps are above; this is
the "why it works" knowledge.


--------------------------------------------------------------------------------
1. THE GOAL OF PHASE 12 (what we're actually doing)
--------------------------------------------------------------------------------

Turn every service into a Docker IMAGE, then run the ENTIRE system
(services + Kafka + databases + Kong) with ONE command via docker-compose.

BEFORE Phase 12:
  - Services run via `npm run dev` on the host
  - Kafka + Kong in containers, app DBs in native PostgreSQL
  - Mixed setup → needed host.docker.internal workarounds

AFTER Phase 12:
  docker compose up   ← ONE command starts EVERYTHING:
     postgres, kafka, 5 services, kong (+ kong-db)
  All on one Docker network → they find each other BY NAME → no host.docker.internal


--------------------------------------------------------------------------------
2. IMAGE vs CONTAINER  (the core distinction)
--------------------------------------------------------------------------------

IMAGE     = the frozen blueprint (code + runtime + dependencies baked in)
            → exists on disk, does nothing by itself
CONTAINER = a running instance of an image
            → the blueprint actually EXECUTING

IMPORTANT: images existing ≠ containers running.
An image can exist while its container crashes on startup.
(We hit exactly this — 5 images built fine, but 4 containers crashed on the
 migrate step. `docker compose ps -a` showed them as "Exited (1)".)

Check images:      docker images
Check containers:  docker compose ps -a   (the -a shows stopped ones too)


--------------------------------------------------------------------------------
3. IS THE CODE INSIDE THE CONTAINER? — YES (for every container)
--------------------------------------------------------------------------------

Kafka container:
  ✅ Java runtime + Kafka's OWN code (written by Confluent) + Kafka's deps
  → code IS inside, but it's KAFKA's code, not yours (you pulled a pre-made image)

Your service (e.g. quickbite-delivery-service):
  ✅ Node.js runtime + YOUR compiled code (dist/index.js) + your node_modules
  → YOUR code IS baked in — at build time, via `COPY src` + `RUN npm run build`

KEY: In BOTH cases code is inside. Difference = whose code:
  Pre-made images (postgres, kafka, kong) → someone else's code
  Your images (quickbite-*)               → your code, baked in by `docker build`


--------------------------------------------------------------------------------
4. WHERE IS DATA STORED? (the classic containerization question)
--------------------------------------------------------------------------------

Per container in THIS project:

  postgres              → data lives in the "postgres-data" VOLUME (host disk)
                          (users, orders, tables — MUST persist)
  kafka                 → data lives in the "kafka-data" VOLUME (host disk)
                          (event messages)
  kong-database         → Kong's config, in a VOLUME
  auth/restaurant/order/  → store NOTHING. They're just running code that
  delivery/notification     READS/WRITES to postgres & kafka. No data of their own.

In-memory / cache / connection pool:
  → lives in the container's RAM → TEMPORARY → gone on restart (and that's fine)


--------------------------------------------------------------------------------
5. STATELESS vs STATEFUL CONTAINERS
--------------------------------------------------------------------------------

THE TEST:
  "If I destroy this container and start a fresh one, do I lose anything important?"
     No  → STATELESS
     Yes → STATEFUL

In THIS project:

  STATELESS (no data → disposable → no volume → can run many copies for scale):
     auth-service, restaurant-service, order-service,
     delivery-service, notification-service, kong

  STATEFUL (precious data → needs a VOLUME → handle carefully):
     postgres, kafka, kong-database

Production rule:
  App services → containers (stateless, disposable, scale freely)
  Databases    → managed service like AWS RDS (stateful, precious)


--------------------------------------------------------------------------------
6. VOLUMES — how a containerized database persists data
--------------------------------------------------------------------------------

By default a container writes to its OWN internal filesystem → TEMPORARY.
Delete the container → that filesystem (and its data) is DESTROYED.

A VOLUME is storage on the HOST machine's disk, OUTSIDE the container.
The container writes to the volume → data SURVIVES container death.

In docker-compose.yml:
     postgres:
       volumes:
         - postgres-data:/var/lib/postgresql/data   # map internal path → volume
     volumes:
       postgres-data:   # declare the named volume

Flow:
  Inside container: /var/lib/postgresql/data   ← Postgres thinks it writes here
  Actually stored:  postgres-data volume        ← on real disk, persists

Commands:
  docker compose down      → containers deleted, VOLUMES SURVIVE → data safe ✅
  docker compose down -v   → ALSO deletes volumes → DATA GONE ⚠️ (dangerous flag)
  docker compose up        → new container reattaches to same volume → data back
  docker volume ls         → see your volumes

Stateless containers (your services) have NO volumes — nothing to persist. Correct.


--------------------------------------------------------------------------------
7. MULTI-STAGE DOCKERFILE (why two stages)
--------------------------------------------------------------------------------

Analogy: you BAKE a cake with an oven + messy bowls, but you SERVE just the cake.
Don't ship the oven with the cake.

STAGE 1 ("builder"): has ALL tools (TypeScript compiler, dev deps).
                     Compiles .ts → .js. Big & messy.
STAGE 2 (final):     starts clean, copies ONLY the finished dist/ from stage 1.
                     Installs only production deps. Small & clean.

The magic line:
     COPY --from=builder /app/dist ./dist
  → grab the finished output from the messy kitchen, put it on the clean plate.

Benefit: final image is small (faster push/pull/deploy) and has no build tools.


--------------------------------------------------------------------------------
8. BUILD TIME vs COMPILE TIME vs RUN TIME
--------------------------------------------------------------------------------

COMPILE TIME → when TypeScript becomes JavaScript (tsc runs)
BUILD TIME   → when the Docker image is assembled (docker build runs)
RUN TIME     → when the container executes your app (node runs)

Nesting:
  BUILD TIME (docker build)
     ├── contains → COMPILE TIME (tsc runs as one step: `RUN npm run build`)
     └── produces → the IMAGE
                       └── later → RUN TIME (container executes the image)

Errors surface at different times:
  COMPILE-TIME error → e.g. "Cannot find module '../eventMessage'" (wrong import)
                       caught during build, BEFORE the app runs ✅ (early = good)
  RUN-TIME error     → e.g. "database connection refused", "table does not exist"
                       only when the running app tries to use it (the migrate crash)

Golden rule: catch errors as early as possible.
  JavaScript → errors at RUN time (user hits the bug)
  TypeScript → errors at COMPILE time (you see it before shipping)
  ← this is the whole reason TypeScript exists.


--------------------------------------------------------------------------------
9. localhost vs host.docker.internal vs container names
--------------------------------------------------------------------------------

"localhost" means different things depending on WHO says it:
  Your machine says localhost   → your machine
  A CONTAINER says localhost    → INSIDE that container (not your machine!)

So a container using "localhost:3001" looks inside ITSELF → fails.

To reach the HOST machine from a container:  host.docker.internal
  (needed while Kong was containerized but services ran on the host)

To reach ANOTHER container in the same network:  use its container/service name
  BEFORE (services on host):  http://host.docker.internal:3001
  AFTER (all containerized):  http://auth-service:3001
  → Docker runs an internal DNS; container names resolve automatically.

This is why in the compose file all URLs use container names:
  @postgres:5432, http://restaurant-service:3002, kafka:9092


--------------------------------------------------------------------------------
10. THE DATABASE STEP — why migrations must be re-run
--------------------------------------------------------------------------------

There are now TWO separate PostgreSQL databases:
  1. NATIVE PostgreSQL (D:\Latest Installations) — where you ran migrate dev before
     → tables already exist here
  2. CONTAINERIZED PostgreSQL (the postgres container) — brand new, empty
     → tables DON'T exist here yet

Tables live INSIDE a specific database and do NOT transfer between databases.
The containers talk to DB #2 (empty), so you must apply the SAME migration files
again to build the tables there.

Three layers:
  SERVER   → the postgres container            ✅ running
  DATABASE → quickbite_auth, etc.              ✅ created by init-db script
  TABLES   → User, Order, Restaurant...        ❌ created by migrations (this step)

Why not bake tables into the image?
  IMAGE = your CODE (same for everyone)
  TABLES = live in the DATABASE (created at runtime, per environment)
  Code and data are deliberately separate.

Why a containerized DB at all (vs just native)?
  → REPRODUCIBILITY. New developer runs `docker compose up` → full working system,
    ZERO database install/setup. Everyone gets identical DB version/config.
  → It's optional locally (native works too), but makes the system self-contained.


--------------------------------------------------------------------------------
11. WHAT IS KONG & WHY IT NEEDS A DATABASE
--------------------------------------------------------------------------------

Kong = the API Gateway. Single front door (port 8000). Routes each request to the
right service, plus rate limiting, CORS, plugins.

Kong must REMEMBER its config: which services exist, which routes map where, which
plugins are active. That has to be stored somewhere.

  DB-LESS mode   → config in a FILE (kong.yml) → no database needed
  DB-BACKED mode → config in Kong's own PostgreSQL → configured live via Admin API
                   ← WE CHOSE THIS (production standard) → hence the kong-database

Every Admin API call you made (Invoke-RestMethod to port 8001) SAVED config into
Kong's database → that's why it survives restarts.

Stateless/stateful:
  kong (the gateway)  → STATELESS (just routes; config lives in the DB)
  kong-database       → STATEFUL  (holds the config → needs a volume)


--------------------------------------------------------------------------------
12. IMAGES YOU MADE vs PRE-MADE IMAGES
--------------------------------------------------------------------------------

PRE-MADE (pulled from Docker Hub — someone else built them):
  postgres:16, confluentinc/cp-kafka:7.6.0, kong:3.7
  → in compose:  image: postgres:16        (just pull and run)

MADE BY YOU (built from your Dockerfile — your code baked in):
  quickbite-auth/restaurant/order/delivery/notification-service
  → in compose:  image: quickbite-auth-service   (or `build: ./auth-service`)


--------------------------------------------------------------------------------
13. DOCKERFILE vs DOCKER-COMPOSE — different jobs
--------------------------------------------------------------------------------

DOCKERFILE  = "how to BUILD an image FROM MY OWN code"
              → you write one only for code YOU wrote

COMPOSE     = "how to RUN containers together"
              → works with BOTH your images AND pre-made ones

Why Kafka/Kong use compose but no Dockerfile:
  You didn't write their code → nothing to BUILD → no Dockerfile.
  They just have a lot of config → compose is the readable way to RUN them.

Without compose you COULD run each with `docker run` + many flags, manual network,
manual env, manual startup order — for 9 containers that's a nightmare.
Compose = write it ONCE in YAML, run with `docker compose up`.


--------------------------------------------------------------------------------
14. .dockerignore — why exclude node_modules and .env
--------------------------------------------------------------------------------

When Docker builds, it copies your folder into the build context.

node_modules → huge, and we reinstall fresh INSIDE the container → don't copy
.env         → SECRETS. Never bake secrets into an image.
               In compose, env vars come from the `environment:` block instead.

It's the Docker equivalent of .gitignore.


--------------------------------------------------------------------------------
15. DEVELOPMENT WORKFLOWS — the two approaches
--------------------------------------------------------------------------------

APPROACH A — services NATIVE (npm run dev), infra in containers
  → fast restart, easy debugging. Best WHILE actively coding a service.

APPROACH B — EVERYTHING in containers (docker compose up)
  → tests the full system as it runs in production. Slower iteration
    (rebuild image on code change). Best for verifying the whole system / CI.

Real teams use BOTH: A day-to-day, B before pushing / in CI.
This is why you have both a native workflow AND the compose stack.


--------------------------------------------------------------------------------
16. THE THREE ENVIRONMENTS (where databases differ)
--------------------------------------------------------------------------------

LOCAL DEV   → containerized DB (compose) OR native — for building
CI/CD       → throwaway containerized DB — spun up fresh per test run, destroyed
PRODUCTION  → MANAGED database service (AWS RDS / Cloud SQL) — NOT a container
              → the app CONTAINERS connect to it via DATABASE_URL

The principle that ties it together:
  The app is containerized and portable.
  The DATABASE_URL changes per environment — container DB locally, managed RDS in
  production — but the app code/image NEVER changes.
  → that's why we read DATABASE_URL from the environment and never hardcode it.


--------------------------------------------------------------------------------
17. PROBLEMS WE HIT IN PHASE 12 (and the lessons)
--------------------------------------------------------------------------------

a) npm install ECONNRESET during docker build
   → slow/unstable network dropped the download mid-way.
   FIX: add npm retry config in the Dockerfile (fetch-retries, longer timeouts),
        and copy node_modules from the builder stage instead of installing twice.
   LESSON: builds depend on the network; make them resilient.

b) "Cannot find module '../eventMessages'" during docker build
   → import said 'eventMessages' (plural) but file is 'eventMessage.ts' (singular).
   → worked locally on Windows (case/name-forgiving) but FAILED in strict Linux build.
   LESSON: Docker/Linux is stricter than local Windows — it catches latent bugs.
           Production runs on Linux, so catching this before deploy is the point.

c) 4 services crashed: "datasource.url property is required ... migrate deploy"
   → the startup `command: npx prisma migrate deploy` failed inside the container
     due to prisma.config.ts + dotenv behavior.
   FIX: removed migrate from container startup; run migrations as a separate step.
   LESSON: migrations are usually a SEPARATE deploy step, not baked into every
           container's startup — cleaner production pattern anyway.


--------------------------------------------------------------------------------
18. COMPLETE MENTAL MODEL (everything in one picture)
--------------------------------------------------------------------------------

  IMAGE     = frozen blueprint (code + runtime + deps baked in)
  CONTAINER = a running instance of an image
  VOLUME    = persistent storage on host disk, OUTSIDE the container

  STATELESS container → no important data → no volume → disposable
     (your 5 services, kong)
  STATEFUL container → holds precious data → NEEDS volume → careful
     (postgres, kafka, kong-database)

  Code IS inside every image (yours = your code; kafka = kafka's code)
  Data is NOT in stateless containers → it's in postgres/kafka VOLUMES
  In-memory/cache → RAM → temporary → gone on restart (fine)

  Pre-made images (postgres, kafka, kong) → pull & run
  Your images → built from your Dockerfile, your code baked in

  localhost inside a container = the container itself
  reach the host → host.docker.internal ; reach another container → its name

  down     → keeps volumes (data safe)
  down -v  → deletes volumes (data gone) ⚠️

  New dev  → docker compose up → full system, zero setup, own volumes
  Dev flow → native for coding speed, containers for full-system test
  Prod DB  → managed service (RDS), NOT a container

  COMPILE TIME (tsc) is INSIDE BUILD TIME (docker build); RUN TIME is after.


================================================================================
                        END OF PHASE 12 CONCEPTS
================================================================================

