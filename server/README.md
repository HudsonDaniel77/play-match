# PlayMatch Server — Backend API

PlayMatch is an AI-powered, location-aware sports matchmaking platform. This repository contains the backend REST API powering both the web app (React) and the mobile app (React Native + Expo).

Implemented Modules:
- **Module 1: Authentication & Identity**
- **Module 2: Player Profile & Onboarding**

---

## Table of Contents
1. [Architecture & Design Principles](#architecture--design-principles)
2. [Prerequisites](#prerequisites)
3. [Setup & Installation](#setup--installation)
4. [Sports Catalog Seeding](#sports-catalog-seeding)
5. [Environment Variables Reference](#environment-variables-reference)
6. [Module 1: Auth & Security Architecture](#module-1-auth--security-architecture)
7. [Module 2: Profile, Onboarding & Privacy Architecture](#module-2-profile-onboarding--privacy-architecture)
   - [Catalog as Data & Seed File Schema](#catalog-as-data--seed-file-schema)
   - [Rating Security & Band Locking](#rating-security--band-locking)
   - [Privacy by Design & Location Coarsening](#privacy-by-design--location-coarsening)
   - [Onboarding Flow State Machine](#onboarding-flow-state-machine)
   - [Geospatial Readiness (2dsphere index)](#geospatial-readiness-2dsphere-index)
8. [API Specification & cURL Examples](#api-specification--curl-examples)
   - [Authentication & Identity](#authentication--identity-endpoints)
   - [Sports Catalog & Admin](#sports-catalog--admin-endpoints)
   - [Player Profile & Onboarding](#player-profile--onboarding-endpoints)
   - [Public Profile Viewing](#public-profile-viewing)
   - [Health Check](#health-check)
9. [Running Automated Tests](#running-automated-tests)
10. [Codebase Structure](#codebase-structure)

---

## Architecture & Design Principles

The backend enforces a strict layered architecture:
```
Routes → Middleware → Controllers → Services → Models
```

- **Zero Hardcoding**: All secrets, ports, URLs, lifetimes, costs, and limits are managed strictly via environment variables validated at startup using Zod (`src/config/index.ts`). Sports, skill bands, seed ratings, play styles, and positions are database data, never code.
- **Zero Magic Strings / Numbers**: Roles, client types, token types, onboarding steps, visibility levels, collection names, error codes, and messages are defined in centralized constants (`src/constants/`).
- **Data Protection & Privacy**:
  - Passwords use bcrypt hashing; refresh and one-time tokens use SHA-256 hashes.
  - `passwordHash` is excluded from default queries (`select: false`) and stripped by JSON transforms.
  - Player locations are coarsened to `LOCATION_PUBLIC_PRECISION_DECIMALS` for public endpoints. Exact coordinates and email addresses are never returned publicly.
- **Unified Response Envelope**: Every HTTP response adheres to a single JSON shape:
  ```json
  // Success
  { "success": true, "data": { ... }, "message": "..." }

  // Error
  { "success": false, "error": { "code": "...", "message": "...", "details": [ ... ] } }
  ```
- **Robust Error Handling**: Centralized error middleware captures domain errors (`AppError`), Mongoose constraint violations, and unhandled exceptions without leaking stack traces or internal secrets in production.
- **Structured Logging**: Powered by Pino with automated redaction of headers, cookies, and sensitive credentials.

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher
- **npm**: `v10.0.0` or higher
- **MongoDB**: `v6.0+` (or an active MongoDB Atlas cluster)

---

## Setup & Installation

### 1. Navigate to the Server Directory
```bash
cd playmatch/server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to create your local `.env` file:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Update the configuration variables in `.env` as required (see the reference table below).

### 4. Seed the Sports Catalog
Populate the database with canonical sports data:
```bash
npm run seed:sports
```

### 5. Build the Project
Compile TypeScript to ES modules in `dist/`:
```bash
npm run build
```

### 6. Run the Server

#### Development Mode (with hot-reload via `tsx watch`):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

---

## Sports Catalog Seeding

Sports are managed as catalog data in the `sports` collection, loaded from `SPORTS_SEED_FILE` (default: `./src/data/sports-seed.json`). The seed command is completely idempotent:
```bash
npm run seed:sports
```

### Seed File Format (`sports-seed.json`)
```json
[
  {
    "key": "badminton",
    "name": "Badminton",
    "isActive": true,
    "isTeamBased": false,
    "minPlayers": 2,
    "maxPlayers": 4,
    "skillBands": [
      { "key": "beginner", "label": "Beginner", "order": 1, "seedRating": 1000 },
      { "key": "intermediate", "label": "Intermediate", "order": 2, "seedRating": 1200 },
      { "key": "advanced", "label": "Advanced", "order": 3, "seedRating": 1400 }
    ],
    "playStyles": [
      { "key": "casual", "label": "Casual / Friendly Rally" },
      { "key": "competitive", "label": "Competitive / Match Play" }
    ],
    "positions": [
      { "key": "singles", "label": "Singles Specialist" },
      { "key": "doubles_front", "label": "Doubles Front Court" }
    ]
  }
]
```

---

## Environment Variables Reference

Every configuration option is validated at boot time via Zod in `src/config/index.ts`. If any variable is missing or malformed, the server halts with a clear error report.

| Variable | Type / Format | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `development \| production \| test` | `development` | Runtime environment. |
| `PORT` | Integer `(1-65535)` | `5000` | Port for the HTTP server. |
| `LOG_LEVEL` | `fatal \| error \| warn \| info \| debug \| trace \| silent` | `info` | Pino log level verbosity. |
| `MONGODB_URI` | Valid URI string | *Required* | MongoDB connection URI. |
| `API_BASE_PATH` | String starting with `/` | `/api/v1` | URL prefix for all API routes. |
| `CLIENT_WEB_URL` | Valid URL | *Required* | Base URL for web client links (verification & password reset). |
| `JWT_ACCESS_SECRET` | String (min 32 chars) | *Required* | Secret key for signing short-lived access JWTs. |
| `JWT_REFRESH_SECRET` | String (min 32 chars) | *Required* | Secret key for refresh tokens. |
| `ACCESS_TOKEN_TTL` | Duration (e.g. `15m`, `1h`) | `15m` | Lifetime of access tokens. |
| `REFRESH_TOKEN_TTL` | Duration (e.g. `7d`, `30d`) | `7d` | Lifetime of refresh sessions. |
| `PASSWORD_HASH_COST` | Integer `(4-31)` | `12` | Bcrypt salt rounds / hashing work factor. |
| `PASSWORD_MIN_LENGTH` | Integer `(>= 8)` | `8` | Minimum allowed password length. |
| `PASSWORD_REQUIRE_COMPLEXITY` | Boolean | `true` | Requires uppercase, lowercase, number, and special character. |
| `MAX_FAILED_LOGINS` | Integer `(>= 1)` | `5` | Maximum failed attempts before account lockout. |
| `LOCKOUT_MINUTES` | Integer `(>= 1)` | `15` | Lockout duration in minutes after threshold is reached. |
| `EMAIL_VERIFICATION_REQUIRED` | Boolean | `true` | Restricts unverified users from accessing protected actions. |
| `EMAIL_TOKEN_TTL` | Duration (e.g. `24h`) | `24h` | Lifetime of one-time email verification links. |
| `PASSWORD_RESET_TOKEN_TTL` | Duration (e.g. `1h`) | `1h` | Lifetime of one-time password reset links. |
| `CORS_ORIGINS` | Comma-separated URLs | `http://localhost:3000` | Whitelist of allowed CORS origins. |
| `COOKIE_DOMAIN` | String | `localhost` | Domain attribute for refresh cookies. |
| `COOKIE_SECURE` | Boolean | `false` | Secure flag for cookies (`true` in production). |
| `COOKIE_SAMESITE` | `lax \| strict \| none` | `lax` | SameSite cookie policy. |
| `REFRESH_COOKIE_NAME` | String | `playmatch_refresh` | Name of the httpOnly cookie storing refresh token. |
| `RATE_LIMIT_WINDOW_MS` | Integer | `900000` (15m) | Rate limiting sliding window in milliseconds. |
| `RATE_LIMIT_MAX` | Integer | `100` | Max requests per IP in window for general routes. |
| `AUTH_RATE_LIMIT_MAX` | Integer | `10` | Max requests per IP in window for auth routes. |
| `SMTP_HOST` | String | `smtp.mailtrap.io` | SMTP server host (required when `EMAIL_TRANSPORT=smtp`). |
| `SMTP_PORT` | Integer | `587` | SMTP server port. |
| `SMTP_USER` | String | `""` | SMTP authentication user. |
| `SMTP_PASS` | String | `""` | SMTP authentication password. |
| `EMAIL_FROM` | String | `PlayMatch Team <noreply@playmatch.app>` | Default sender display name and address. |
| `EMAIL_TRANSPORT` | `smtp \| console` | `console` | `console` prints emails to logger (for dev); `smtp` delivers via SMTP. |
| `CLIENT_HEADER_NAME` | String | `x-client-type` | Header used to identify client platform (`web` or `mobile`). |
| `DEFAULT_SEED_RATING` | Integer (`>= 100`) | `1200` | Fallback seed rating if a band has none specified. |
| `PROVISIONAL_GAMES_THRESHOLD` | Integer (`>= 1`) | `10` | Games threshold below which a rating is marked provisional. |
| `MAX_SPORTS_PER_PLAYER` | Integer `(1-20)` | `5` | Maximum number of sports a player can select. |
| `MIN_TRAVEL_RADIUS_KM` | Number (`>= 1`) | `1` | Minimum allowable travel search radius. |
| `MAX_TRAVEL_RADIUS_KM` | Number (`>= 5`) | `100` | Maximum allowable travel search radius. |
| `DEFAULT_TRAVEL_RADIUS_KM` | Number (`>= 1`) | `15` | Default travel search radius. |
| `MAX_AVAILABILITY_SLOTS_PER_DAY` | Integer (`>= 1`) | `6` | Maximum slots per weekday. |
| `MIN_SLOT_DURATION_MINUTES` | Integer (`>= 15`) | `30` | Minimum duration in minutes for an availability slot. |
| `LOCATION_PUBLIC_PRECISION_DECIMALS`| Integer `(0-6)` | `2` | Number of decimals public coordinates are rounded to. |
| `BIO_MAX_LENGTH` | Integer (`>= 50`) | `500` | Maximum character length for user bio. |
| `NAME_MIN_LENGTH` | Integer (`>= 1`) | `2` | Minimum character length for display name. |
| `NAME_MAX_LENGTH` | Integer (`>= 10`) | `50` | Maximum character length for display name. |
| `MIN_AGE` | Integer (`>= 5`) | `13` | Minimum age required. |
| `MAX_AGE` | Integer (`>= 50`) | `100` | Maximum plausible age. |
| `SPORTS_SEED_FILE` | String | `./src/data/sports-seed.json` | Path to JSON file used for seeding sports. |
| `DEFAULT_TIMEZONE` | IANA Timezone string | `UTC` | Fallback timezone suggestion. |

---

## Module 1: Auth & Security Architecture

1. **Dual Client Support (`X-Client-Type`)**:
   - Web clients receive refresh tokens via `httpOnly`, `SameSite=Lax`, `Path=/api/v1/auth` cookies.
   - Mobile clients receive refresh tokens in the JSON response payload for Expo `SecureStore`.
2. **Refresh Token Rotation & Family Reuse Detection**:
   - Every refresh issues a new refresh token and invalidates the previous one.
   - If an expired/replaced refresh token is presented, **token reuse is detected**: all active sessions in the token's family are immediately revoked (`AUTH_TOKEN_REUSE_DETECTED`), protecting the account from compromised sessions.
3. **Lockout & Anti-Enumeration**:
   - Account locks for `LOCKOUT_MINUTES` after `MAX_FAILED_LOGINS` failures.
   - Login errors use identical generic error messages (`AUTH_INVALID_CREDENTIALS`).
   - Forgot-password always returns an identical success message.

---

## Module 2: Profile, Onboarding & Privacy Architecture

### Rating Security & Band Locking (Non-Negotiable Rule 6)
- **Zero Client Ratings**: No client request can specify a rating value. Any attempt to send a `rating` field is rejected by strict validation.
- **Seed Rating Derivation**: The starting rating is derived exclusively from the chosen skill band's `seedRating` in the sport catalog (e.g. beginner = 1000, intermediate = 1200, advanced = 1400).
- **Band Locking Rule**: A player may freely change their skill band only while `Rating.gamesPlayed === 0`. Once `gamesPlayed > 0`, the band is locked and attempts to change it return `RATING_LOCKED_AFTER_GAMES` (HTTP 409). Future updates belong exclusively to the Elo rating engine (Module 3).
- **Soft-Removal**: Omitting a sport sets `SportProfile.isActive = false` while preserving the rating history.

### Privacy by Design & Location Coarsening
- Public profile requests (`GET /api/v1/profiles/:userId`) never return exact coordinates or email addresses.
- Coordinates are coarsened via:
  ```typescript
  round(coord * 10^decimals) / 10^decimals
  ```
  At `LOCATION_PUBLIC_PRECISION_DECIMALS=2`, accuracy is coarsened to ~1.1 km, shielding residential addresses while preserving regional proximity for matchmaking.
- Privacy settings are strictly honored:
  - If `visibility.profile === 'private'`, public requests are blocked (HTTP 403 `PROFILE_PRIVATE`).
  - If `visibility.location === 'hidden'`, coordinates and labels are omitted.
  - If `visibility.ratings === 'hidden'`, numerical ratings are omitted from the sports list.

### Onboarding Flow State Machine
Onboarding consists of 5 discrete steps defined in constants:
1. `basic_info`: Display name, bio, avatar URL, date of birth, timezone.
2. `sports`: Selecting 1 to `MAX_SPORTS_PER_PLAYER` sports and initial skill bands.
3. `availability`: Setting non-overlapping weekly time slots.
4. `location`: Setting home coordinates and travel search radius.
5. `preferences`: Configuring privacy and play styles.

Each save endpoint records its completion in `profile.onboarding.completedSteps`. Calling `POST /profile/me/onboarding/complete` verifies that all 5 steps are present and that at least one active sport is configured, otherwise returning `400 Bad Request` with `missingSteps`.
The reusable `requireOnboardingComplete` middleware guards matchmaking and games for future modules.

### Geospatial Readiness (2dsphere index)
`Profile.homeLocation` is indexed with a MongoDB `2dsphere` index:
```typescript
profileSchema.index({ homeLocation: '2dsphere' });
```
This enables `$near` spherical proximity queries for Module 5 (geospatial matchmaking and venue search).

---

## API Specification & cURL Examples

### Authentication & Identity Endpoints

#### 1. Register User
`POST /api/v1/auth/register`
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -c cookies.txt \
  -d '{
    "email": "player@playmatch.app",
    "password": "SecurePassword123!",
    "name": "Alex Morgan"
  }'
```

#### 2. Login
`POST /api/v1/auth/login`
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -c cookies.txt \
  -d '{
    "email": "player@playmatch.app",
    "password": "SecurePassword123!"
  }'
```

#### 3. Refresh Token
`POST /api/v1/auth/refresh`
```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Client-Type: web" \
  -b cookies.txt -c cookies.txt
```

#### 4. Logout
`POST /api/v1/auth/logout`
```bash
curl -X POST http://localhost:5000/api/v1/auth/logout \
  -b cookies.txt -c cookies.txt
```

#### 5. Verify Email
`POST /api/v1/auth/verify-email`
```bash
curl -X POST http://localhost:5000/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{ "token": "<ONE_TIME_VERIFICATION_TOKEN>" }'
```

---

### Sports Catalog & Admin Endpoints

#### 6. Get Active Sports Catalog (Public)
`GET /api/v1/sports`
```bash
curl -X GET http://localhost:5000/api/v1/sports
```

#### 7. Admin: Create Catalog Sport
`POST /api/v1/admin/sports`
```bash
curl -X POST http://localhost:5000/api/v1/admin/sports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{
    "key": "volleyball",
    "name": "Volleyball",
    "minPlayers": 4,
    "maxPlayers": 12,
    "skillBands": [
      { "key": "beginner", "label": "Beginner", "order": 1, "seedRating": 1000 },
      { "key": "intermediate", "label": "Intermediate", "order": 2, "seedRating": 1200 },
      { "key": "advanced", "label": "Advanced", "order": 3, "seedRating": 1400 }
    ],
    "playStyles": [
      { "key": "beach", "label": "Beach Volleyball 2v2" },
      { "key": "indoor_sixes", "label": "Indoor 6v6" }
    ],
    "positions": [
      { "key": "setter", "label": "Setter" },
      { "key": "outside_hitter", "label": "Outside Hitter" }
    ]
  }'
```

#### 8. Admin: Update / Deactivate Sport
`PATCH /api/v1/admin/sports/:id`
```bash
curl -X PATCH http://localhost:5000/api/v1/admin/sports/<SPORT_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>" \
  -d '{ "isActive": false }'
```

---

### Player Profile & Onboarding Endpoints

#### 9. Get Own Profile
`GET /api/v1/profile/me`
```bash
curl -X GET http://localhost:5000/api/v1/profile/me \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>"
```

#### 10. Update Basic Info (Step 1)
`PUT /api/v1/profile/me/basic`
```bash
curl -X PUT http://localhost:5000/api/v1/profile/me/basic \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>" \
  -d '{
    "displayName": "Alex Morgan",
    "bio": "Avid badminton and tennis player looking for weekend morning games.",
    "avatarUrl": "https://example.com/avatar.jpg",
    "dateOfBirth": "1996-05-12",
    "timezone": "America/New_York"
  }'
```

#### 11. Update Sports & Skill Bands (Step 2)
`PUT /api/v1/profile/me/sports`
```bash
curl -X PUT http://localhost:5000/api/v1/profile/me/sports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>" \
  -d '{
    "sports": [
      {
        "sportId": "<BADMINTON_SPORT_ID>",
        "selectedBandKey": "intermediate",
        "playStyle": "competitive",
        "preferredPositions": ["singles"]
      }
    ]
  }'
```

#### 12. Update Availability Slots (Step 3)
`PUT /api/v1/profile/me/availability`
```bash
curl -X PUT http://localhost:5000/api/v1/profile/me/availability \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>" \
  -d '{
    "slots": [
      { "dayOfWeek": 1, "startMinute": 1080, "endMinute": 1260 },
      { "dayOfWeek": 6, "startMinute": 540, "endMinute": 720 }
    ]
  }'
```

#### 13. Update Home Location & Radius (Step 4)
`PUT /api/v1/profile/me/location`
```bash
curl -X PUT http://localhost:5000/api/v1/profile/me/location \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>" \
  -d '{
    "coordinates": [-122.4194, 37.7749],
    "locationLabel": "Mission District, San Francisco",
    "travelRadiusKm": 20
  }'
```

#### 14. Update Preferences & Visibility (Step 5)
`PUT /api/v1/profile/me/preferences`
```bash
curl -X PUT http://localhost:5000/api/v1/profile/me/preferences \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>" \
  -d '{
    "visibility": {
      "profile": "public",
      "location": "coarsened",
      "ratings": "public"
    }
  }'
```

#### 15. Check Onboarding Progress
`GET /api/v1/profile/me/onboarding`
```bash
curl -X GET http://localhost:5000/api/v1/profile/me/onboarding \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>"
```

#### 16. Complete Onboarding
`POST /api/v1/profile/me/onboarding/complete`
```bash
curl -X POST http://localhost:5000/api/v1/profile/me/onboarding/complete \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>"
```

#### 17. Get Player Ratings
`GET /api/v1/profile/me/ratings`
```bash
curl -X GET http://localhost:5000/api/v1/profile/me/ratings \
  -H "Authorization: Bearer <PLAYER_JWT_TOKEN>"
```

---

### Public Profile Viewing

#### 18. View Another Player's Profile (Privacy Masked)
`GET /api/v1/profiles/:userId`
```bash
curl -X GET http://localhost:5000/api/v1/profiles/<PLAYER_USER_ID>
```

**Sample Response (Location coarsened to ~1.1km, email withheld):**
```json
{
  "success": true,
  "data": {
    "id": "670451a2e4b09c2d8a4f1234",
    "displayName": "Alex Morgan",
    "bio": "Avid badminton and tennis player looking for weekend morning games.",
    "avatarUrl": "https://example.com/avatar.jpg",
    "sports": [
      {
        "sport": {
          "id": "67045091e4b09c2d8a4f1001",
          "name": "Badminton",
          "key": "badminton"
        },
        "bandKey": "intermediate",
        "bandLabel": "Intermediate (Consistent Clears & Drops)",
        "rating": 1200,
        "provisional": true
      }
    ],
    "location": {
      "label": "Mission District, San Francisco",
      "coordinates": [-122.42, 37.77]
    }
  }
}
```

---

### Health Check

`GET /api/v1/health` or `GET /health`
```bash
curl -X GET http://localhost:5000/health
```

---

## Running Automated Tests

Automated tests run against an in-memory MongoDB instance (`mongodb-memory-server`) with Vitest:

```bash
npm test
```

### Coverage across 18 Test Suites (60 Total Tests):
- **Module 1**: Registration, dual-client cookie/body delivery, login, generic anti-enumeration errors, account lockout and auto-unlock, refresh token rotation, token reuse detection and family revocation, single logout vs logout-all, email verification, password reset, change password, RBAC authorization, and configuration fail-fast tests.
- **Module 2**:
  - Sports catalog seeding idempotency.
  - Public active catalog retrieval and admin management.
  - Basic profile info updating, IANA timezone validation, and age constraints.
  - Sport selection, seed rating assignment, client rating override rejection, band locking after rated games (`gamesPlayed > 0`), and soft-removal.
  - Availability slot duration, overlap rejection, and max slots limits.
  - Location coordinates validation, travel radius limits, and **2dsphere geospatial search query** (`$near`).
  - Public profile privacy masking, location coarsening to configured decimal precision, and private profile protection.
  - Onboarding state tracking, missing steps validation, and the `requireOnboardingComplete` middleware guard.

---

## Codebase Structure

```
server/
├── src/
│   ├── config/
│   │   └── index.ts                 # Zod env schema, startup fail-fast validation
│   ├── constants/
│   │   ├── client-types.ts          # ClientType (web, mobile), headers
│   │   ├── collections.ts           # Mongoose collection names
│   │   ├── days-of-week.ts          # Day indices (0-6)
│   │   ├── error-codes.ts           # Standard application error codes
│   │   ├── http-status.ts           # HTTP status constants
│   │   ├── messages.ts              # Centralized user-facing messages
│   │   ├── onboarding-steps.ts      # Onboarding steps and statuses
│   │   ├── roles.ts                 # Role definitions (player, venue_owner, admin)
│   │   ├── token-types.ts           # TokenType (email_verification, password_reset)
│   │   ├── user-status.ts           # UserStatus (active, suspended)
│   │   ├── visibility.ts            # Profile, location, ratings visibility enums
│   │   └── index.ts
│   ├── controllers/
│   │   ├── auth.controller.ts       # Auth handlers
│   │   ├── health.controller.ts     # Health check handler
│   │   ├── profile.controller.ts    # Profile & onboarding HTTP handlers
│   │   ├── sport.controller.ts      # Sports catalog and admin handlers
│   │   └── index.ts
│   ├── data/
│   │   └── sports-seed.json         # Canonical sports catalog seed data
│   ├── middleware/
│   │   ├── authenticate.ts          # Bearer JWT verification & user attachment
│   │   ├── authorize.ts             # Role-based access control (RBAC)
│   │   ├── error-handler.ts         # Centralized error handler & status mapping
│   │   ├── not-found.ts             # 404 handler
│   │   ├── rate-limiter.ts          # General and auth rate limiters
│   │   ├── request-id.ts            # UUID tracing middleware
│   │   ├── require-onboarding-complete.ts # Onboarding completion guard
│   │   ├── require-verified-email.ts# Email verification gate
│   │   ├── validate-request.ts      # Zod request validation middleware
│   │   └── index.ts
│   ├── models/
│   │   ├── user.model.ts            # User schema
│   │   ├── refresh-session.model.ts # RefreshSession schema with TTL index
│   │   ├── one-time-token.model.ts  # OneTimeToken schema with TTL index
│   │   ├── sport.model.ts           # Sport catalog schema with skill bands
│   │   ├── profile.model.ts         # Profile schema with 2dsphere index
│   │   ├── sport-profile.model.ts   # SportProfile schema with compound unique index
│   │   ├── rating.model.ts          # Rating schema with compound unique index
│   │   └── index.ts
│   ├── routes/
│   │   ├── auth.routes.ts           # /auth/* routes
│   │   ├── health.routes.ts         # /health routes
│   │   ├── profile.routes.ts        # /profile and /profiles routes
│   │   ├── sport.routes.ts          # /sports and /admin/sports routes
│   │   └── index.ts
│   ├── scripts/
│   │   └── seed-sports.ts           # Idempotent sports catalog seed script
│   ├── services/
│   │   ├── auth.service.ts          # Authentication logic
│   │   ├── email.service.ts         # Email transport
│   │   ├── onboarding.service.ts    # Onboarding evaluation & completion logic
│   │   ├── password.service.ts      # Password hashing & complexity validation
│   │   ├── profile.service.ts       # Profile updates & privacy coarsening
│   │   ├── sport.service.ts         # Catalog query & admin operations
│   │   ├── sport-profile.service.ts # Sport assignment, band locking, seed ratings
│   │   ├── token.service.ts         # JWT, refresh rotation, reuse detection
│   │   └── index.ts
│   ├── utils/
│   │   ├── api-response.ts          # Standard JSON success and error response senders
│   │   ├── app-error.ts             # Custom error hierarchy
│   │   ├── crypto.ts                # Secure token generation & SHA-256 hashing
│   │   ├── logger.ts                # Pino logger with automated redaction
│   │   ├── password.ts              # Bcrypt hash/compare helpers
│   │   └── index.ts
│   ├── app.ts                       # Express setup & middleware pipeline (no listen)
│   └── server.ts                    # Server startup, DB connection, graceful shutdown
├── tests/
│   ├── fixtures/
│   │   ├── sport.fixture.ts         # Sport test data factories
│   │   └── user.fixture.ts          # User test data factories
│   ├── setup.ts                     # In-memory MongoDB lifecycle for Vitest
│   ├── auth.change-password.test.ts
│   ├── auth.email-verify.test.ts
│   ├── auth.lockout.test.ts
│   ├── auth.login.test.ts
│   ├── auth.logout.test.ts
│   ├── auth.me-and-roles.test.ts
│   ├── auth.password-reset.test.ts
│   ├── auth.refresh.test.ts
│   ├── auth.register.test.ts
│   ├── config.test.ts
│   ├── health.test.ts
│   ├── onboarding.test.ts
│   ├── profile-availability.test.ts
│   ├── profile-basic.test.ts
│   ├── profile-location-geospatial.test.ts
│   ├── profile-privacy-coarsening.test.ts
│   ├── profile-sports-rating.test.ts
│   └── sport-catalog.test.ts
├── .env.example                     # Fully documented environment template
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```
