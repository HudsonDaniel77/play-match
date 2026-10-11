# Getting Started with PlayMatch Backend

Welcome to the PlayMatch backend repository! This guide will get you up and running locally in under 15 minutes.

---

## 1. Prerequisites

- **Node.js**: `v20.0.0` or higher (verify with `node -v`)
- **npm**: `v10.0.0` or higher
- **MongoDB**: Either Docker / Docker Compose OR in-memory persistent runner (no manual Atlas connection required).

---

## 2. Environment Setup

Copy `.env.example` (or `.env.local.example`) to `.env` in `/server`:

```bash
cd server
cp .env.local.example .env
```

Key environment configuration variables:
- `PORT`: Server port (default: `5000`)
- `NODE_ENV`: Set to `development` for local workflows
- `MONGODB_URI`: `mongodb://localhost:27017/playmatch?replicaSet=rs0&directConnection=true`
- `JWT_ACCESS_SECRET`: Secret key for JWT access tokens
- `JWT_REFRESH_SECRET`: Secret key for JWT refresh tokens
- `DEMO_PASSWORD`: (Optional) Demo password for seeded accounts. If omitted, a secure password is generated and logged once during seeding.

> **Safety Notice**: PlayMatch strictly refuses remote databases or `mongodb+srv://` connection strings during demo seeding. Local development must point to `localhost` or `127.0.0.1`.

---

## 3. Database Setup (Replica Set)

PlayMatch requires a MongoDB **replica set** because multi-document transactions are used for game scheduling, ratings, and court reservations.

### Option A: Using Docker (Recommended for environments with Docker)

Start the single-node replica set with automatic initialization:

```bash
# From repo root or /server
npm run db:up
```

To stop:
```bash
npm run db:down
```

To reset the database volume:
```bash
npm run db:reset
```

### Option B: Without Docker (`npm run db:memory`)

If Docker is not installed on your system:

```bash
# In /server
npm run db:memory
```

This starts a persistent in-memory MongoDB replica set on port `27017` that fulfills all transaction requirements and safety allowlists. Leave this terminal open during local development.

---

## 4. Install Dependencies & Seed Catalog

```bash
cd server
npm install

# Seed sports catalog (Badminton, Cricket, Football)
npm run seed:sports
```

---

## 5. Seed Demo Data

To populate the database with realistic demo accounts, approved venues, courts, upcoming games, and rating histories:

```bash
npm run seed:demo
```

### Reset & Reseed
To drop only the local database and freshly reseed:
```bash
npm run seed:demo -- --reset
```

### Default Demo Accounts

All demo accounts belong to the `@playmatch.demo` domain:
- **Admin**: `admin@playmatch.demo`
- **Venue Owner**: `owner@playmatch.demo`
- **Players (12 total across skill bands)**:
  - `arun.kumar@playmatch.demo` (Badminton intermediate)
  - `priya.sharma@playmatch.demo` (Badminton beginner)
  - `rahul.dravid@playmatch.demo` (Cricket expert)
  - `deepak.chahar@playmatch.demo` (Cricket intermediate)
  - `karthik.rajan@playmatch.demo` (Football advanced)
  - `sunil.chhetri@playmatch.demo` (Football expert)
  - ...and more.

Password: Defined in `DEMO_PASSWORD` env variable, or printed to the console during seed execution.

---

## 6. Run the Server

```bash
# Development mode with hot reloading
npm run dev

# Or build and run production bundle
npm run build
npm start
```

Health check:
- `GET http://localhost:5000/health`
- `GET http://localhost:5000/api/v1/health`

---

## 7. Testing & Quality Checks

```bash
# Run Vitest test suite with coverage
npm test

# Run ESLint
npm run lint

# Check TypeScript build
npm run build

# Validate OpenAPI spec synchronization
npm run openapi:check
```
