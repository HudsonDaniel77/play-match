# PlayMatch Module Guide

A walkthrough of the 5 implemented modules and their domain interactions.

---

## Module 1: Auth & Identity
- **Path**: `src/routes/auth.routes.ts`, `src/services/auth.service.ts`
- **Roles**: `player`, `venue_owner`, `admin`
- **Features**:
  - Secure registration and email verification tokens.
  - Dual-token lifecycle (refresh cookie for web, payload for mobile).
  - Refresh token reuse detection revoking family sessions.
  - Password reset flows via cryptographically random tokens.

---

## Module 2: Profile, Sports Catalog & Onboarding
- **Path**: `src/routes/profile.routes.ts`, `src/routes/sport.routes.ts`
- **Features**:
  - Supported sports: **badminton, cricket, football** (data-driven schema).
  - Multi-step player onboarding state machine (`basic_info` -> `sports` -> `availability` -> `location` -> `preferences`).
  - Private home location storage with coarsened spectator views.
  - Initial self-assessed skill bands.

---

## Module 3: Elo Rating Engine
- **Path**: `src/routes/rating.routes.ts`, `src/services/rating-engine.service.ts`
- **Features**:
  - Per-sport dynamic Elo calculation based on match outcome and margin of victory.
  - Dynamic K-factors scaling by match confidence and player history.
  - Full match result application and voiding with atomic rollback.
  - Transparent event audit logs explaining rating movements.

---

## Module 4: Games & Scheduling
- **Path**: `src/routes/game.routes.ts`, `src/services/game.service.ts`, `src/services/game-participant.service.ts`
- **Features**:
  - Game lifecycle state machine: `open` -> `full` -> `confirmed` -> `in_progress` -> `completed` / `cancelled`.
  - Schedule conflict prevention for players.
  - Host approvals, waitlist promotions, and leave-time cutoffs.
  - Exact vs coarsened location privacy rules.

---

## Module 5: Geo Discovery & Venues
- **Path**: `src/routes/venue.routes.ts`, `src/services/venue.service.ts`, `src/services/discovery.service.ts`
- **Features**:
  - Venue catalog management: courts, weekly hours, temporary closures.
  - Two-phase approval workflow (`pending_approval` -> `active` / `suspended`).
  - Strict court reservation guards (`CourtGuard`) preventing double booking under concurrent requests.
  - Privacy-preserving game discovery (`/api/v1/games/discover`) with rounded distance sorting and pagination.
  - Centroid-based venue recommendations for game rosters.

---

## 🛠️ How to Add Module 6+ Checklist

When adding subsequent modules (e.g., Module 6: Matchmaking & Recommendations, Module 7: Chat & Notifications, etc.), follow this standardized checklist to maintain system integrity, test coverage, and documentation consistency:

### 1. Domain Constants & Error Codes
- [ ] Define module-specific enums/constants in `src/constants/<module>-constants.ts` (e.g. status state machines, sub-types).
- [ ] Add domain error codes to `src/constants/error-codes.ts`.
- [ ] Add user-facing message strings to `src/constants/messages.ts`.
- [ ] Re-export new constants from `src/constants/index.ts`.

### 2. Mongoose Models & Schemas
- [ ] Create `src/models/<entity>.model.ts` with strict TypeScript document and interface definitions.
- [ ] Implement appropriate 2dsphere, unique compound, or TTL indexes.
- [ ] Ensure `toJSON` transforms format `id` and keep internal fields consistent without stripping necessary query attributes.
- [ ] Register new models in `src/models/index.ts` and ensure collections are created in `tests/setup.ts` if transactions will touch them.

### 3. Zod Request Validators
- [ ] Create `src/validators/<module>.validators.ts` for all route inputs (body, query params, path params).
- [ ] Validate date formats, ranges, coordinates, and enum constraints using Zod schemas.
- [ ] Re-export new validator schemas from `src/validators/index.ts`.

### 4. Domain Services & Business Logic
- [ ] Implement business logic in `src/services/<module>.service.ts`.
- [ ] Inject `Clock` (`defaultClock` in production, `TestClock` in tests) for any time-dependent evaluation (cutoffs, expirations, slots).
- [ ] Use MongoDB multi-document transactions with bounded retries for concurrent state modifications.
- [ ] Buffer domain events with `TransactionEventBuffer` to ensure events are emitted **only after** transaction commits.
- [ ] Centralize errors by throwing `AppError` with HTTP status codes and domain error codes.

### 5. Controllers & Standard Envelope
- [ ] Create `src/controllers/<module>.controller.ts`.
- [ ] Wrap all responses in the standard JSON envelope: `ApiResponse.success(res, data, message, statusCode)` or `ApiResponse.error(...)`.
- [ ] Keep controllers thin: validate, invoke services, and respond.

### 6. Express Routes & Middleware
- [ ] Create `src/routes/<module>.routes.ts`.
- [ ] Protect endpoints using `authenticate`, `authorize(Roles...)`, `requireOnboardingComplete`, and `validateRequest(schema)`.
- [ ] Mount the sub-router in `src/routes/index.ts`.

### 7. OpenAPI Spec & Drift Check
- [ ] Update `src/scripts/generate-openapi.ts` to document all new paths, parameters, schemas, and security requirements.
- [ ] Run `npm run openapi:export` to generate the updated `server/openapi.json`.
- [ ] Verify zero drift with `npm run openapi:check`.

### 8. Testing Suite (Vitest)
- [ ] Create dedicated test files in `tests/<module>-*.test.ts`.
- [ ] Cover authorization checks, input validation errors, happy path flows, and concurrency/race conditions.
- [ ] Run `npm test` and ensure 100% of existing and new tests pass.

### 9. Lint & Build
- [ ] Run `npm run lint` and verify zero errors.
- [ ] Run `npm run build` and ensure TypeScript compiles cleanly.

