import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as hooks from '../src/query/hooks.js';

// Table mapping OpenAPI Operation IDs to live hooks
export const OPENAPI_OPERATION_TO_HOOK_MAP: Record<string, string> = {
  // Auth
  login: 'useLogin',
  register: 'useRegister',
  logout: 'useLogout',

  // Sports Catalog
  getSportsCatalog: 'useSportsCatalog',
  getSportByKey: 'useSportDetail',

  // Profile & Onboarding
  getMyProfile: 'useMyProfile',
  updateMyProfile: 'useUpdateProfile',
  getOnboardingStatus: 'useOnboardingStatus',

  // Ratings & Leaderboards
  getMyRatings: 'useMyRatings',
  getMyRatingHistory: 'useRatingHistory',
  getSportLeaderboard: 'useLeaderboardInfinite',

  // Games
  createGame: 'useCreateGame',
  getMyGames: 'useMyGames',
  getGameById: 'useGameDetail',
  getGameRoster: 'useGameRoster',
  joinGame: 'useJoinGame',
  leaveGame: 'useLeaveGame',

  // Discovery
  discoverGames: 'useDiscoverGames',

  // Venues
  getVenues: 'useVenues',
  getVenueById: 'useVenueDetail',
};

// Explicitly excluded operations (admin endpoints, server-to-server, verification callbacks)
export const EXPLICIT_OPERATION_EXCLUSIONS = new Set([
  'refreshToken', // Handled automatically inside ApiClient.refreshSession()
  'verifyEmail', // Web deep link callback / server redirect
  'resendVerificationEmail',
  'forgotPassword',
  'resetPassword',
  'applyMatchResultAdmin', // Admin only
  'voidMatchResultAdmin', // Admin only
  'adminListUsers', // Admin only
  'adminUpdateUserStatus', // Admin only
  'submitOnboardingStep',
  'completeOnboarding',
  'getVenueSuggestionsForGame',
  'editGame',
  'cancelGame',
  'approveParticipant',
  'declineParticipant',
  'checkParticipantEligibility',
  'createVenue',
  'updateVenue',
  'submitVenueForApproval',
  'approveVenueAdmin',
  'rejectVenueAdmin',
  'suspendVenueAdmin',
  'addCourt',
  'updateCourt',
  'deleteCourt',
  'addVenueClosure',
  'deleteVenueClosure',
  'checkCourtAvailability',
  'discoverVenues',
]);

describe('OpenAPI Operation to Hook Coverage Test', () => {
  it('verifies every OpenAPI operation has a typed hook or is on the explicit exclusion list', () => {
    const specPath = path.resolve(__dirname, '../../../server/openapi.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

    const missingOperations: string[] = [];
    const availableHookNames = new Set(Object.keys(hooks));

    for (const [pathKey, pathItem] of Object.entries<any>(spec.paths)) {
      for (const [method, operation] of Object.entries<any>(pathItem)) {
        if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase()) && operation.operationId) {
          const opId = operation.operationId;
          const mappedHook = OPENAPI_OPERATION_TO_HOOK_MAP[opId];

          if (mappedHook) {
            expect(availableHookNames.has(mappedHook)).toBe(true);
          } else if (!EXPLICIT_OPERATION_EXCLUSIONS.has(opId)) {
            missingOperations.push(`${method.toUpperCase()} ${pathKey} (operationId: ${opId})`);
          }
        }
      }
    }

    if (missingOperations.length > 0) {
      console.error('Missing hooks for operations:', missingOperations);
    }
    expect(missingOperations).toEqual([]);
  });
});
