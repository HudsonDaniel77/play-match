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

## 🚀 Quick Start

### Backend (Server)

For comprehensive setup, API specs, and configuration guide, refer to the [Server README](server/README.md).

```bash
# Navigate to the server directory
cd server

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Run database seeds (Sports catalog)
npm run seed:sports

# Start in development mode
npm run dev
```

---

## 🛠️ Tech Stack

- **Runtime & Language**: Node.js, TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Testing**: Vitest, Supertest, MongoMemoryServer
- **Security & Validation**: Zod, Argon2, JWT, Helmet, Rate Limiting, CORS
