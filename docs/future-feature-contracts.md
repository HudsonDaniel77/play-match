# Future Feature Contracts & Mock Seam Specification

This document defines the interface contracts, data schemas, and replacement procedures for features not yet implemented on the backend.

Every future feature is architected with a 3-part seam in `packages/shared/src/features/<feature>/`:
1. `contract.ts`: TypeScript interfaces and Zod validation schemas.
2. `mock.ts`: Realistic deterministic fixtures with configurable simulated latency, validated against the schema.
3. `live.ts`: Live API slot currently throwing `FeatureNotAvailableError` (HTTP 501 equivalent).
4. `useFeature<Feature>()`: Hook selecting either the mock or live adapter based on client configuration (`FEATURE_<NAME>_MODE=mock|live`, default `mock`).

---

## 1. AI Matchmaking & Game Recommendations (`recommendations`)

- **Hook**: `useFeatureRecommendations(client)`
- **Schema & Types**:
  - `score`: Number between 0 and 1 indicating match quality.
  - `confidence`: `'low' | 'medium' | 'high'`.
  - `factors`: Array of `{ name, value, weight }`.
  - `reasons`: Human-readable explanation bullets.

---

## 2. Team Formation & Balancing (`teams`)

- **Hook**: `useFeatureTeamSuggestion(client, gameId)`
- **Schema & Types**:
  - `teams`: Array of `{ sideKey, name, players: [{ userId, displayName, rating, position }], ratingTotal, ratingAverage }`.
  - `balance`: `{ difference: number, method: string }`.
  - `reasons`: Explanation strings for player distributions.

---

## 3. Result Submission & Verification (`results`)

- **Hook**: `useFeatureGameResult(client, gameId)`
- **Schema & Types**:
  - `status`: `'pending_confirmation' | 'verified' | 'disputed' | 'resolved' | 'no_result' | 'voided'`.
  - `proposal`: `{ proposedByUserId, proposedAt, scores: [{ sideKey, score, winner }], notes }`.
  - `whoMustActNext`: Array of user IDs required to verify/confirm.
  - `ratingStatus`: `'not_processed' | 'applied' | 'voided'`.

---

## 4. Notifications & Chat Channel (`notifications`)

- **Hook**: `useFeatureNotifications(client)`
- **Schema & Types**:
  - `notifications`: Array of `{ id, userId, type, title, message, read, createdAt, data }`.
  - `unreadCount`: Total unread count.
  - `RealtimeNotificationEvent`: Real-time WebSocket event contract payload.

---

## 5. Player Reliability Tracking (`reliability`)

- **Hook**: `useFeatureReliability(client, userId)`
- **Schema & Types**:
  - `reliability`: `{ score (0-100), tier ('bronze'|'silver'|'gold'|'platinum'), gamesCounted, onTimeLeaves, lateLeaves, noShows }`.

---

## "Demo Data" UI Badge Requirement
Every UI surface displaying mock data exposes `isMock` from the query hook and displays a **"Demo Data"** pill badge using `getMockBadgeSpec(isMock)`.

---

## How Teammates Implement Live Features (Replacing Mocks)
1. Implement backend routes and controllers under `/server/src`.
2. Re-export OpenAPI spec in `/server`: `npm run openapi:export`.
3. In `packages/shared`, run `npm run gen:api`.
4. In `packages/shared/src/features/<feature>/live.ts`, replace `throw new FeatureNotAvailableError` with live `client.get(...)` / `client.post(...)` calls.
5. In client app `.env`, flip `FEATURE_<FEATURE_NAME>_MODE=live`.
6. Run `npm test` across all workspaces to verify contracts and end-to-end integration.
