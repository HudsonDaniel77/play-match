# Team Tasks & Handover: Frontend Foundation & Modules 6–12

## Current Status
The PlayMatch frontend foundation and backend handover infrastructure are complete.

### What is Completed:
1. **Monorepo Setup**: Root npm workspaces for `packages/*` and `apps/*`. `/server` runs independently with its own scripts and lockfile.
2. **`@playmatch/shared`**:
   - Pinned OpenAPI 3.0 types generated from `server/openapi.json` (`npm run gen:api`, `npm run check:api`).
   - Unified `ApiClient` with single-flight token refresh, runtime stripping of leaked/exact distance fields, and `_id` to `id` normalization.
   - Web & Mobile auth adapters (`navigator.locks` across tabs, `SecureStore` rotated refresh token handling).
   - TanStack Query hooks covering all live endpoints.
   - Future feature mock seam (`recommendations`, `teams`, `results`, `notifications`, `reliability`) with contracts, mock fixtures, and live slots.
3. **`apps/web`**:
   - React 18, Vite (port 3000 aligned with `CLIENT_WEB_URL`), React Router, Tailwind CSS with design tokens.
   - `AuthProvider` restoring session on boot, `ProtectedRoute`, and live `StatusPage`.
4. **`apps/mobile`**:
   - Expo SDK 52, `expo-secure-store`, `AppState` focusManager wiring.
   - `StatusScreen` with backend URL diagnostics.
5. **Documentation**:
   - `docs/getting-started.md`, `docs/api-contract.md`, `docs/architecture.md`, `docs/module-guide.md`, `docs/future-feature-contracts.md`.

---

## Upcoming Team Assignments

### Teammate 1: Web App Features (Modules 1–5 UI)
- [ ] Implement Auth screens: Login, Register, Email Verification.
- [ ] Implement Onboarding wizard & Player Profile.
- [ ] Implement Game Discovery map/list view with coarsened location display.
- [ ] Implement Game detail, roster view, join/leave flows.

### Teammate 2: Mobile App Features (Expo Go)
- [ ] Connect mobile screens to `@playmatch/shared` hooks.
- [ ] Integrate device GPS via `expo-location` with privacy rounding before queries.
- [ ] Build player profile and sports preference management.
- [ ] Test on Android emulator (`10.0.2.2`) and physical devices via LAN IP.

### Teammate 3: Backend Modules (Modules 6–12)
- [ ] Follow checklist in `docs/module-guide.md` to add new modules.
- [ ] Replace mock adapters in `packages/shared/src/features/` with live endpoints as backend endpoints are built.
- [ ] Run `npm run openapi:export` and `npm run gen:api` upon adding new routes.
