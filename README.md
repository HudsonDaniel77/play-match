# PlayMatch ⚽🎾🏸

> AI-powered, location-aware sports matchmaking platform connecting players, teams, and venues.

---

## 📁 Repository Structure

```
playmatch/
├── server/          # Node.js + Express + TypeScript REST API backend
│   ├── src/         # Application source code (Auth, Profiles, Sports catalog)
│   ├── tests/       # Unit & integration test suites (Vitest)
│   └── README.md    # Detailed server setup, API documentation & architecture
└── .gitignore       # Repository ignore rules
```

---

## 📚 Documentation

Detailed engineering and API guides are available in `/docs`:
- [Getting Started Guide](docs/getting-started.md) - Run everything in under 15 minutes
- [API Contract & Error Envelope](docs/api-contract.md) - Request envelopes, error codes, and headers
- [Architecture & Design](docs/architecture.md) - Multi-doc transactions, clock injection, and privacy
- [Module Walkthrough](docs/module-guide.md) - Modules 1 through 5 overview
- [OpenAPI Specification](server/openapi.json) - Full OpenAPI 3.0 specification

---

## 🚀 Quick Start

### 1. Database (Local Replica Set)

PlayMatch requires a MongoDB replica set for multi-document transaction support:

```bash
# Option A: Using Docker Compose
docker compose up -d

# Option B: Persistent in-memory replica set (no Docker required)
cd server && npm run db:memory
```

### 2. Backend Setup

```bash
cd server

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env

# Seed sports catalog & demo accounts/games
npm run seed:sports
npm run seed:demo

# Start development server
npm run dev
```

---

## 🛠️ Tech Stack

- **Runtime & Language**: Node.js, TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Testing**: Vitest, Supertest, MongoMemoryServer
- **Security & Validation**: Zod, Argon2, JWT, Helmet, Rate Limiting, CORS
