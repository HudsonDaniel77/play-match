# Team Tasks: Remaining Backend

Frontend (web and mobile) is owned by Guru. Teammates work ONLY in `/server`
(plus the Python ML service for Module 6). Do not edit `apps/` or `packages/shared`.

## How we work
- One git branch per module, branched from `main`, merged only after tests, lint, build and the OpenAPI drift check pass. Run `npm run openapi:export` whenever routes change and commit `server/openapi.json`.
- Follow `docs/module-guide.md` (constants, errors, validators, services, controllers, routes, tests).
- Response envelope, location privacy, audit events and race-safety rules apply to every module. Never hardcode values; never touch the hosted database; use `db:memory` and the in-memory test DB.
- Match `docs/future-feature-contracts.md` exactly. The contracts are the agreement with the frontend. If a contract must change, edit that file in the same pull request and tell Guru before merging.
- After the frontend foundation is merged to `main`, also run `npm --prefix packages/shared run gen:api` and commit the result, or CI fails on type drift.

## B. Backend fixes (Teammate 1, first, small branch)
1. Login response must not return `failedLoginAttempts` or `lockUntil`; add a public user serializer and a test.
2. Check `/games/discover` for a free-form (no venue) game: no `exactDistanceMeters`, no unrounded distance. Strip and test if present.
3. Confirm `applyMatchResult` is safe when a player has no rating document yet; add a test.
4. Decide whether discovery should exclude the caller's own games.
5. Demo data: add more completed games or document `LEADERBOARD_EXCLUDE_PROVISIONAL=false` for local use.
6. Make game responses consistent about `id` versus `_id` if it can be done without breaking tests.

## Modules (each: prompt, Phase 0 plan reviewed, branch, merge)
| Module | Owner | Depends on | Contract |
|---|---|---|---|
| 6 AI matching and recommendations (consumes `matchSignals`; returns score, confidence, factors, reasons) | T1 | Modules 4, 5 | recommendations |
| 7 Team formation (balanced teams from ratings, constraint solver, balance report) | T2 | Modules 3, 4 | teams |
| 8 Result submission and verification (feeds `applyMatchResult`; prompt rewritten after 7) | T2 | 7 | results |
| 9 Explainability layer (unify "why" responses, decision log) | T1 | 6, 7 | recommendations, teams |
| 10 Real-time and notifications (WebSockets, push) | free | domain events | notifications |
| 11 Feedback and reliability | T2 | 8 | reliability |
| 12 Admin and moderation | free | all | none yet |

## Not our priority
Docker setup is unverified; verify `docker-compose.yml` when a machine with Docker is available.
Questions to settle with them
Who writes the per-module prompts? I can write them in the same style as the earlier ones (role, context, study step, safety rules, config, models, endpoints, tests, phases, definition of done). Teammates then paste them into their own agents. I’d start with Module 6 and Module 7, since both can start now.
Merge order: merge P1 to main first. Then your frontend PR can go in once your own fixes are done. Teammates can branch from main after P1 and start immediately, since the backend work doesn’t depend on the frontend.
Contracts: the contracts the agent wrote are a first draft. Review docs/future-feature-contracts.md yourself before teammates build against it, because it’s the one place where a mistake costs both sides rework.
