# PlayMatch Architecture & Design

This document details the backend architectural patterns, state machines, domain events, security model, and concurrency guarantees of the PlayMatch backend.

---

## 1. Layered Architecture

The backend follows a layered pattern:

```
HTTP Request
     │
     ▼
[ Express Router ] ─── (src/routes/)
     │
     ▼
[ Middlewares ] ────── (src/middleware/: rate-limiter, authenticate, authorize, validate-request, onboarding-check)
     │
     ▼
[ Controllers ] ────── (src/controllers/: HTTP param parsing, status codes, standard envelope)
     │
     ▼
[ Domain Services ] ── (src/services/: business logic, multi-doc transactions, event buffers)
     │
     ▼
[ Persistence ] ────── (src/models/: Mongoose schemas, 2dsphere indexes, audit events)
     │
     ▼
[ MongoDB Replica Set ]
```

---

## 2. Injected Clock & Deterministic Testing

All time-sensitive domain logic (such as game start lead times, cancellation deadlines, waitlist auto-expiry, and rating event sequences) receives an injected `Clock` interface:

```typescript
export interface Clock {
  now(): Date;
}
```

- In production runtime: `defaultClock` returns `new Date()`.
- In test suites and seed scripts: `TestClock` allows advancing or freezing time deterministically without mocking global timers.

---

## 3. Location Privacy & Geo-Discovery

To prevent stalking and address harvesting:
1. **Host & Joined Players**: Receive exact venue/game coordinates (`[longitude, latitude]`), exact court names, and full street addresses.
2. **Spectators & Public Discovery**: Coordinates are systematically coarsened using `coarsenCoordinates` (`DISTANCE_PRIVACY_ROUNDING_KM`), truncating GPS precision to approximate neighborhood centroids (~1 km radius).
3. **Cursor Protection**: Keyset cursors for game discovery encode the **rounded** distance rather than raw GPS distances to prevent triangulation attacks via varying distance probes.

---

## 4. Concurrency & Transaction Guarantees

PlayMatch uses MongoDB multi-document transactions with bounded retries:
1. **Court Double-Booking Prevention**:
   - `CourtGuard` collection with a unique compound index `{ venueId, courtId }`.
   - Before a game locks a court, it increments the guard version inside the transaction or fails with a write conflict.
   - When moving a game between courts/venues, guards are acquired in deterministic sorted key order to eliminate deadlocks.
2. **Elo Rating Engine**:
   - Matches are processed atomically.
   - Player ratings feature optimistic concurrency controls with bounded retries against conflicting concurrent match submissions.

---

## 5. Domain Events & Post-Commit Emission

Domain events (`venue.created`, `venue.approved`, `venue.suspended`, `game.created`, `game.cancelled`, etc.) are captured using `TransactionEventBuffer`:
- Events are buffered during active MongoDB transactions.
- Events are emitted **only after** the transaction successfully commits.
- If a transaction aborts or rolls back, no events are leaked.

---

## 6. Authentication & Session Security

- **Dual-token JWT pattern**: Short-lived Access Tokens (15 min) + Long-lived Refresh Tokens (7 days).
- **Client differentiation**:
  - `web`: Refresh tokens stored in `httpOnly`, `sameSite: strict`, `secure` cookies.
  - `mobile`: Refresh tokens returned in the JSON payload when `x-client-type: mobile` header is supplied.
- **Refresh Token Family Rotation**: Token reuse triggers automatic revocation of all active sessions in the token family.
