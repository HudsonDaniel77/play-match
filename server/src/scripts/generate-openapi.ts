import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ErrorCodes } from '../constants/error-codes.js';
import { GameStatuses, JoinPolicies, GameVisibilities, ParticipantRoles, ParticipantStatuses } from '../constants/game-constants.js';
import { VenueStatuses, DiscoverySortOptions } from '../constants/venue-constants.js';
import { Roles } from '../constants/roles.js';
import { TeamSideKeys, TeamBalanceMethods } from '../constants/team-constants.js';
import { ResultStatuses, RatingStatuses } from '../constants/result-constants.js';
import { AttendanceStatuses, ReliabilityTiers, FEEDBACK_NOTE_MAX_LENGTH } from '../constants/reliability-constants.js';
import { RecommendationConfidenceLevels } from '../constants/recommendation-constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../../openapi.json');

export function generateOpenAPISpec() {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'PlayMatch REST API',
      description: 'API documentation for PlayMatch: AI-powered, location-aware sports matchmaking platform (badminton, cricket, football).',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer Access Token in Authorization header',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'refreshToken',
          description: 'Refresh token cookie for web clients',
        },
      },
      parameters: {
        ClientTypeHeader: {
          name: 'x-client-type',
          in: 'header',
          required: false,
          schema: {
            type: 'string',
            enum: ['web', 'mobile'],
            default: 'web',
          },
          description: 'Client platform type',
        },
        RequestIdHeader: {
          name: 'X-Request-Id',
          in: 'header',
          required: false,
          schema: {
            type: 'string',
          },
          description: 'Trace identifier for the request',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
            message: { type: 'string', example: 'Operation completed successfully' },
          },
        },
        ApiErrorResponse: {
          type: 'object',
          required: ['success', 'error'],
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: {
                  type: 'string',
                  enum: Object.values(ErrorCodes),
                  example: ErrorCodes.VALIDATION_ERROR,
                },
                message: { type: 'string', example: 'Validation failed' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string' },
                      message: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        ErrorCodesEnum: {
          type: 'string',
          enum: Object.values(ErrorCodes),
        },
        GameStatusesEnum: {
          type: 'string',
          enum: Object.values(GameStatuses),
        },
        JoinPoliciesEnum: {
          type: 'string',
          enum: Object.values(JoinPolicies),
        },
        GameVisibilitiesEnum: {
          type: 'string',
          enum: Object.values(GameVisibilities),
        },
        ParticipantRolesEnum: {
          type: 'string',
          enum: Object.values(ParticipantRoles),
        },
        ParticipantStatusesEnum: {
          type: 'string',
          enum: Object.values(ParticipantStatuses),
        },
        VenueStatusesEnum: {
          type: 'string',
          enum: Object.values(VenueStatuses),
        },
        DiscoverySortOptionsEnum: {
          type: 'string',
          enum: Object.values(DiscoverySortOptions),
        },
        UserRolesEnum: {
          type: 'string',
          enum: Object.values(Roles),
        },
        TeamSideKeysEnum: {
          type: 'string',
          enum: Object.values(TeamSideKeys),
        },
        TeamBalanceMethodsEnum: {
          type: 'string',
          enum: Object.values(TeamBalanceMethods),
        },
        TeamFormationPlayer: {
          type: 'object',
          required: ['userId', 'displayName', 'rating'],
          properties: {
            userId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            displayName: { type: 'string', example: 'Player 1' },
            rating: { type: 'number', example: 1200 },
            position: { type: 'string', example: 'forward' },
          },
        },
        TeamFormationTeam: {
          type: 'object',
          required: ['sideKey', 'name', 'players', 'ratingTotal', 'ratingAverage'],
          properties: {
            sideKey: { $ref: '#/components/schemas/TeamSideKeysEnum' },
            name: { type: 'string', example: 'Team A' },
            players: {
              type: 'array',
              items: { $ref: '#/components/schemas/TeamFormationPlayer' },
            },
            ratingTotal: { type: 'number', example: 2400 },
            ratingAverage: { type: 'number', example: 1200 },
          },
        },
        TeamFormationBalance: {
          type: 'object',
          required: ['difference', 'method'],
          properties: {
            difference: { type: 'number', example: 0 },
            method: { $ref: '#/components/schemas/TeamBalanceMethodsEnum' },
          },
        },
        TeamFormationPayload: {
          type: 'object',
          required: ['teams', 'balance', 'reasons'],
          properties: {
            teams: {
              type: 'array',
              items: { $ref: '#/components/schemas/TeamFormationTeam' },
            },
            balance: { $ref: '#/components/schemas/TeamFormationBalance' },
            reasons: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        TeamFormationResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { $ref: '#/components/schemas/TeamFormationPayload' },
          },
        },
        ResultStatusesEnum: {
          type: 'string',
          enum: Object.values(ResultStatuses),
        },
        RatingStatusesEnum: {
          type: 'string',
          enum: Object.values(RatingStatuses),
        },
        GameResultScore: {
          type: 'object',
          required: ['sideKey', 'score', 'winner'],
          properties: {
            sideKey: { type: 'string', example: 'team_a' },
            score: { type: 'integer', minimum: 0, example: 21 },
            winner: { type: 'boolean', example: true },
          },
        },
        GameResultProposal: {
          type: 'object',
          required: ['proposedByUserId', 'proposedAt', 'scores'],
          properties: {
            proposedByUserId: { type: 'string', example: '507f1f77bcf86cd799439011' },
            proposedAt: { type: 'string', format: 'date-time' },
            scores: {
              type: 'array',
              items: { $ref: '#/components/schemas/GameResultScore' },
            },
            notes: { type: 'string', example: 'Good game' },
          },
        },
        GameResultPayload: {
          type: 'object',
          required: [
            'id',
            'gameId',
            'status',
            'ratingStatus',
            'proposal',
            'whoMustActNext',
          ],
          properties: {
            id: { type: 'string', example: '507f1f77bcf86cd799439012' },
            gameId: { type: 'string', example: '507f1f77bcf86cd799439013' },
            status: { $ref: '#/components/schemas/ResultStatusesEnum' },
            ratingStatus: { $ref: '#/components/schemas/RatingStatusesEnum' },
            proposal: { $ref: '#/components/schemas/GameResultProposal' },
            whoMustActNext: {
              type: 'array',
              items: { type: 'string' },
            },
            verifiedAt: { type: 'string', format: 'date-time' },
            disputedAt: { type: 'string', format: 'date-time' },
            disputedByUserId: { type: 'string' },
            resolvedAt: { type: 'string', format: 'date-time' },
          },
        },
        GameResultResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { $ref: '#/components/schemas/GameResultPayload' },
          },
        },
        SubmitResultRequestBody: {
          type: 'object',
          required: ['scores'],
          properties: {
            scores: {
              type: 'array',
              minItems: 2,
              items: { $ref: '#/components/schemas/GameResultScore' },
            },
            notes: { type: 'string', maxLength: 500 },
          },
        },
        DisputeResultRequestBody: {
          type: 'object',
          properties: {
            reason: { type: 'string', maxLength: 500 },
          },
        },
        SubmitFeedbackRequestBody: {
          type: 'object',
          required: ['targetUserId', 'attendance'],
          properties: {
            targetUserId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
            attendance: { type: 'string', enum: [AttendanceStatuses.ATTENDED, AttendanceStatuses.NO_SHOW] },
            note: { type: 'string', maxLength: FEEDBACK_NOTE_MAX_LENGTH },
          },
        },
        GameFeedbackPayload: {
          type: 'object',
          required: ['id', 'gameId', 'reporterUserId', 'targetUserId', 'attendance'],
          properties: {
            id: { type: 'string' },
            gameId: { type: 'string' },
            reporterUserId: { type: 'string' },
            targetUserId: { type: 'string' },
            attendance: { type: 'string', enum: Object.values(AttendanceStatuses) },
            note: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        GameFeedbackResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { $ref: '#/components/schemas/GameFeedbackPayload' },
          },
        },
        GameFeedbackListResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: {
              type: 'object',
              required: ['feedback'],
              properties: {
                feedback: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/GameFeedbackPayload' },
                },
              },
            },
          },
        },
        ReliabilitySummary: {
          type: 'object',
          required: ['score', 'tier', 'gamesCounted', 'onTimeLeaves', 'lateLeaves', 'noShows'],
          properties: {
            score: { type: 'integer', minimum: 0, maximum: 100 },
            tier: { type: 'string', enum: Object.values(ReliabilityTiers) },
            gamesCounted: { type: 'integer', minimum: 0 },
            onTimeLeaves: { type: 'integer', minimum: 0 },
            lateLeaves: { type: 'integer', minimum: 0 },
            noShows: { type: 'integer', minimum: 0 },
          },
        },
        ReliabilityResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: {
              type: 'object',
              required: ['userId', 'reliability'],
              properties: {
                userId: { type: 'string' },
                reliability: { $ref: '#/components/schemas/ReliabilitySummary' },
              },
            },
          },
        },
        RecommendationFactor: {
          type: 'object',
          required: ['name', 'value', 'weight'],
          properties: {
            name: { type: 'string', example: 'Skill Match' },
            value: { type: 'number', minimum: 0, maximum: 1, example: 0.95 },
            weight: { type: 'number', minimum: 0, maximum: 1, example: 0.35 },
          },
        },
        RecommendationItem: {
          type: 'object',
          required: ['gameId', 'sportKey', 'title', 'score', 'confidence', 'factors', 'reasons'],
          properties: {
            gameId: { type: 'string' },
            sportKey: { type: 'string', example: 'badminton' },
            title: { type: 'string', example: 'Intermediate Singles' },
            score: { type: 'number', minimum: 0, maximum: 1, example: 0.92 },
            confidence: {
              type: 'string',
              enum: Object.values(RecommendationConfidenceLevels),
              example: 'high',
            },
            factors: {
              type: 'array',
              items: { $ref: '#/components/schemas/RecommendationFactor' },
            },
            reasons: {
              type: 'array',
              items: { type: 'string' },
              example: ['Close skill match (within 30 Elo points)'],
            },
          },
        },
        RecommendationsPayload: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/RecommendationItem' },
            },
          },
        },
        RecommendationsResponse: {
          type: 'object',
          required: ['success', 'data'],
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
            data: { $ref: '#/components/schemas/RecommendationsPayload' },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check probe',
          description: 'Returns health status and uptime',
          responses: {
            '200': {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'API versioned health check probe',
          responses: {
            '200': {
              description: 'API is healthy',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
      },
      '/api/v1/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Register a new player or venue owner account',
          parameters: [{ $ref: '#/components/parameters/ClientTypeHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    role: { $ref: '#/components/schemas/UserRolesEnum' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Account registered successfully',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in with credentials',
          parameters: [{ $ref: '#/components/parameters/ClientTypeHeader' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Login successful',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate and exchange refresh token for fresh tokens',
          parameters: [{ $ref: '#/components/parameters/ClientTypeHeader' }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Tokens rotated successfully',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Log out current session',
          parameters: [{ $ref: '#/components/parameters/ClientTypeHeader' }],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Session terminated',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
          },
        },
      },
      '/api/v1/auth/logout-all': {
        post: {
          tags: ['Auth'],
          summary: 'Revoke all sessions for current user',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'All user sessions revoked',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
          },
        },
      },
      '/api/v1/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Get current authenticated user identity',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Authenticated user profile',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
          },
        },
      },
      '/api/v1/auth/verify-email': {
        post: {
          tags: ['Auth'],
          summary: 'Verify user email with one-time verification token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: { token: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Email verified' },
          },
        },
      },
      '/api/v1/auth/resend-verification': {
        post: {
          tags: ['Auth'],
          summary: 'Resend email verification token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Verification sent' },
          },
        },
      },
      '/api/v1/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request password reset email',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password reset email triggered' },
          },
        },
      },
      '/api/v1/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Reset account password with reset token',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'password'],
                  properties: {
                    token: { type: 'string' },
                    password: { type: 'string', minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password successfully changed' },
          },
        },
      },
      '/api/v1/auth/change-password': {
        post: {
          tags: ['Auth'],
          summary: 'Change current account password while authenticated',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword', 'newPassword'],
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8 },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Password changed successfully' },
          },
        },
      },
      '/api/v1/sports': {
        get: {
          tags: ['Sports'],
          summary: 'Get list of active sports supported by PlayMatch',
          responses: {
            '200': {
              description: 'Active sports catalog',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } },
              },
            },
          },
        },
      },
      '/api/v1/admin/sports': {
        get: {
          tags: ['Admin - Sports'],
          summary: 'Get all sports including inactive (Admin only)',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'All sports' },
          },
        },
        post: {
          tags: ['Admin - Sports'],
          summary: 'Create a new sport catalog entry (Admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['key', 'name', 'minPlayers', 'maxPlayers'],
                  properties: {
                    key: { type: 'string' },
                    name: { type: 'string' },
                    minPlayers: { type: 'number' },
                    maxPlayers: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            '201': { description: 'Sport created' },
          },
        },
      },
      '/api/v1/admin/sports/{id}': {
        patch: {
          tags: ['Admin - Sports'],
          summary: 'Update sport configuration (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
          responses: {
            '200': { description: 'Sport updated' },
          },
        },
      },
      '/api/v1/profile/me': {
        get: {
          tags: ['Profile'],
          summary: 'Get my profile',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Player profile' },
          },
        },
      },
      '/api/v1/profile/me/basic': {
        put: {
          tags: ['Profile'],
          summary: 'Update basic profile information',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    displayName: { type: 'string' },
                    bio: { type: 'string' },
                    age: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Basic info updated' } },
        },
      },
      '/api/v1/profile/me/sports': {
        put: {
          tags: ['Profile'],
          summary: 'Update player sports & initial self-assessed skill bands',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sports'],
                  properties: {
                    sports: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['sportKey', 'initialBandKey'],
                        properties: {
                          sportKey: { type: 'string' },
                          initialBandKey: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Sports updated' } },
        },
      },
      '/api/v1/profile/me/availability': {
        put: {
          tags: ['Profile'],
          summary: 'Update weekly availability slots',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['weeklySlots'],
                  properties: {
                    weeklySlots: {
                      type: 'array',
                      items: {
                        type: 'object',
                        required: ['dayOfWeek', 'startMinute', 'endMinute'],
                        properties: {
                          dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
                          startMinute: { type: 'integer' },
                          endMinute: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Availability updated' } },
        },
      },
      '/api/v1/profile/me/location': {
        put: {
          tags: ['Profile'],
          summary: 'Update private home location and travel radius',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['location', 'travelRadiusKm'],
                  properties: {
                    location: {
                      type: 'object',
                      required: ['coordinates'],
                      properties: {
                        coordinates: {
                          type: 'array',
                          items: { type: 'number' },
                          minItems: 2,
                          maxItems: 2,
                        },
                      },
                    },
                    travelRadiusKm: { type: 'number' },
                    areaLabel: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Location updated' } },
        },
      },
      '/api/v1/profile/me/preferences': {
        put: {
          tags: ['Profile'],
          summary: 'Update profile visibility and notification preferences',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    visibility: { type: 'string', enum: ['public', 'private', 'friends_only'] },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Preferences updated' } },
        },
      },
      '/api/v1/profile/me/onboarding': {
        get: {
          tags: ['Profile - Onboarding'],
          summary: 'Get onboarding state and remaining steps',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Onboarding state' } },
        },
      },
      '/api/v1/profile/me/onboarding/complete': {
        post: {
          tags: ['Profile - Onboarding'],
          summary: 'Validate and mark onboarding complete',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Onboarding completed' } },
        },
      },
      '/api/v1/profile/me/ratings': {
        get: {
          tags: ['Profile'],
          summary: 'Get my ratings across configured sports',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'User sport ratings' } },
        },
      },
      '/api/v1/profiles/{userId}': {
        get: {
          tags: ['Profile'],
          summary: 'Get public profile for a player with coarsened location',
          parameters: [
            { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Public profile' } },
        },
      },
      '/api/v1/ratings/me': {
        get: {
          tags: ['Ratings'],
          summary: 'Get all sport ratings for current user',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Ratings' } },
        },
      },
      '/api/v1/ratings/me/{sportKey}/history': {
        get: {
          tags: ['Ratings'],
          summary: 'Get rating progression history for a sport',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'sportKey', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Rating history' } },
        },
      },
      '/api/v1/ratings/me/{sportKey}/events/{eventId}/explanation': {
        get: {
          tags: ['Ratings'],
          summary: 'Get natural language and mathematical explanation of rating change',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'sportKey', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'eventId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Rating explanation' } },
        },
      },
      '/api/v1/ratings/preview': {
        post: {
          tags: ['Ratings'],
          summary: 'Preview expected Elo deltas for a prospective match',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sportKey', 'sides'],
                  properties: {
                    sportKey: { type: 'string' },
                    sides: { type: 'array' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Predicted rating deltas' } },
        },
      },
      '/api/v1/admin/ratings/match-results': {
        post: {
          tags: ['Admin - Ratings'],
          summary: 'Apply match result to calculate and commit Elo updates (Admin only)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { type: 'object' } },
            },
          },
          responses: { '200': { description: 'Match result applied' } },
        },
      },
      '/api/v1/admin/ratings/match-results/{id}/void': {
        post: {
          tags: ['Admin - Ratings'],
          summary: 'Void the most recent match result (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Match result voided' } },
        },
      },
      '/api/v1/leaderboards/{sportKey}': {
        get: {
          tags: ['Leaderboards'],
          summary: 'Get leaderboard for a sport',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'sportKey', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Leaderboard list' } },
        },
      },
      '/api/v1/games/discover': {
        get: {
          tags: ['Games - Discovery'],
          summary: 'Discover upcoming games near player coordinates with privacy protection',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'longitude', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'latitude', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'sportKey', in: 'query', schema: { type: 'string' } },
            { name: 'radiusKm', in: 'query', schema: { type: 'number' } },
            { name: 'sortBy', in: 'query', schema: { $ref: '#/components/schemas/DiscoverySortOptionsEnum' } },
            { name: 'cursor', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: { '200': { description: 'Discovered games list' } },
        },
      },
      '/api/v1/games/me': {
        get: {
          tags: ['Games'],
          summary: 'List games joined or hosted by current player',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Player games' } },
        },
      },
      '/api/v1/games/code/{code}': {
        get: {
          tags: ['Games'],
          summary: 'Lookup game by public invite code (coarsened location)',
          parameters: [
            { name: 'code', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Game details' } },
        },
      },
      '/api/v1/games': {
        post: {
          tags: ['Games'],
          summary: 'Create a new game (free-form or venue court linked)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sportKey', 'formatKey', 'startsAt', 'endsAt'],
                  properties: {
                    sportKey: { type: 'string' },
                    formatKey: { type: 'string' },
                    startsAt: { type: 'string', format: 'date-time' },
                    endsAt: { type: 'string', format: 'date-time' },
                    venueId: { type: 'string' },
                    courtId: { type: 'string' },
                    joinPolicy: { $ref: '#/components/schemas/JoinPoliciesEnum' },
                    visibility: { $ref: '#/components/schemas/GameVisibilitiesEnum' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Game created' } },
        },
      },
      '/api/v1/games/{id}': {
        get: {
          tags: ['Games'],
          summary: 'Get game by ID (exact location if participant, coarsened if spectator)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Game details' } },
        },
        patch: {
          tags: ['Games'],
          summary: 'Update game details (host only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Game updated' } },
        },
      },
      '/api/v1/games/{id}/cancel': {
        post: {
          tags: ['Games'],
          summary: 'Cancel game with structured cancellation reason',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reasonCode'],
                  properties: {
                    reasonCode: { type: 'string' },
                    reasonText: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Game cancelled' } },
        },
      },
      '/api/v1/games/{id}/join': {
        post: {
          tags: ['Games'],
          summary: 'Join or request to join a game',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Joined or requested' } },
        },
      },
      '/api/v1/games/{id}/leave': {
        post: {
          tags: ['Games'],
          summary: 'Leave game or withdraw join request',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Player left game' } },
        },
      },
      '/api/v1/games/{id}/participants/{userId}/approve': {
        post: {
          tags: ['Games - Participants'],
          summary: 'Approve pending join request (host only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Participant approved' } },
        },
      },
      '/api/v1/games/{id}/participants/{userId}/decline': {
        post: {
          tags: ['Games - Participants'],
          summary: 'Decline pending join request (host only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Participant declined' } },
        },
      },
      '/api/v1/games/{id}/participants/{userId}': {
        delete: {
          tags: ['Games - Participants'],
          summary: 'Remove joined participant (host only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Participant removed' } },
        },
      },
      '/api/v1/games/{id}/roster': {
        get: {
          tags: ['Games'],
          summary: 'Get roster categorized by joined, requested, and waitlisted members',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Game roster' } },
        },
      },
      '/api/v1/games/{id}/eligibility': {
        get: {
          tags: ['Games'],
          summary: 'Pre-flight eligibility check for joining game',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Eligibility response' } },
        },
      },
      '/api/v1/games/{id}/timeline': {
        get: {
          tags: ['Games'],
          summary: 'View audit timeline events for game',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Audit timeline events' } },
        },
      },
      '/api/v1/games/{id}/events': {
        get: {
          tags: ['Games'],
          summary: 'Alias for audit timeline events',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Audit timeline events' } },
        },
      },
      '/api/v1/games/{id}/venue-suggestions': {
        get: {
          tags: ['Games - Venues'],
          summary: 'Get geo-optimized venue suggestions for game roster',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Venue suggestions' } },
        },
      },
      '/api/v1/games/{gameId}/teams': {
        get: {
          tags: ['Games - Teams'],
          summary: 'Get saved balanced teams for a game',
          description: 'Retrieve persisted team formation for a game. Available to participants and the game host.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'gameId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                pattern: '^[0-9a-fA-F]{24}$',
              },
              description: 'Target game ObjectId (24-character hex)',
            },
          ],
          responses: {
            '200': {
              description: 'Saved team formation retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TeamFormationResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/games/{gameId}/teams/generate': {
        post: {
          tags: ['Games - Teams'],
          summary: 'Generate and persist balanced teams for a game (host only)',
          description: 'Generate balanced teams using snake draft balancer and persist snapshot. Host only.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'gameId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                pattern: '^[0-9a-fA-F]{24}$',
              },
              description: 'Target game ObjectId (24-character hex)',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  additionalProperties: false,
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Balanced teams generated and persisted successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TeamFormationResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/reliability/me': {
        get: {
          tags: ['Reliability'],
          summary: 'Get the caller reliability',
          description: 'Reliability score, tier and attendance counters for the authenticated player',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': {
              description: 'Reliability retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReliabilityResponse' },
                },
              },
            },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/reliability/{userId}': {
        get: {
          tags: ['Reliability'],
          summary: 'Get another player reliability',
          description: 'Respects the target profile privacy settings (private profile or hidden ratings return 403)',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'userId',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'User ObjectId (24-character hex)',
            },
          ],
          responses: {
            '200': {
              description: 'Reliability retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ReliabilityResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/games/{id}/feedback': {
        get: {
          tags: ['Games - Feedback'],
          summary: 'List attendance feedback for a game',
          description: 'Host sees all feedback; other joined participants see only feedback about themselves',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          responses: {
            '200': {
              description: 'Feedback retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameFeedbackListResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        post: {
          tags: ['Games - Feedback'],
          summary: 'Record attendance feedback for a player (host only)',
          description: 'Host records whether a joined player attended or was a no-show. Game must be completed and within the feedback window. One entry per player per game.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SubmitFeedbackRequestBody' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Feedback recorded',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameFeedbackResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
            '409': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/games/{id}/results': {
        get: {
          tags: ['Games - Results'],
          summary: 'Get match result state for a game',
          description: 'Fetch the submitted or verified score result state for a game',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          responses: {
            '200': {
              description: 'Match result retrieved',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameResultResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
        post: {
          tags: ['Games - Results'],
          summary: 'Submit a new score proposal for a game',
          description: 'Joined participant submits match result scores. Game transitions to completed and opposing team is prompted in whoMustActNext.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SubmitResultRequestBody' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Match result proposal submitted',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameResultResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
            '409': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/games/{id}/results/verify': {
        post: {
          tags: ['Games - Results'],
          summary: 'Confirm and verify proposed score, triggering Elo rating engine',
          description: 'Opposing player in whoMustActNext verifies proposed match score. Updates result status to verified and applies rating updates.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: false },
              },
            },
          },
          responses: {
            '200': {
              description: 'Result verified and ratings applied',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameResultResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
            '409': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/games/{id}/results/dispute': {
        post: {
          tags: ['Games - Results'],
          summary: 'Dispute proposed match score',
          description: 'Opposing player in whoMustActNext disputes proposed match score.',
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' },
              description: 'Game ObjectId (24-character hex)',
            },
          ],
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DisputeResultRequestBody' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Result disputed successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/GameResultResponse' },
                },
              },
            },
            '400': { $ref: '#/components/schemas/ApiErrorResponse' },
            '401': { $ref: '#/components/schemas/ApiErrorResponse' },
            '403': { $ref: '#/components/schemas/ApiErrorResponse' },
            '404': { $ref: '#/components/schemas/ApiErrorResponse' },
            '409': { $ref: '#/components/schemas/ApiErrorResponse' },
          },
        },
      },
      '/api/v1/venues': {
        get: {
          tags: ['Venues'],
          summary: 'Discover approved venues near coordinates (Public)',
          parameters: [
            { name: 'longitude', in: 'query', schema: { type: 'number' } },
            { name: 'latitude', in: 'query', schema: { type: 'number' } },
            { name: 'sportKey', in: 'query', schema: { type: 'string' } },
            { name: 'radiusKm', in: 'query', schema: { type: 'number' } },
          ],
          responses: { '200': { description: 'Venues list' } },
        },
        post: {
          tags: ['Venues'],
          summary: 'Create a venue (Venue Owner or Admin)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'address', 'areaLabel', 'location', 'weeklyHours', 'courts'],
                  properties: {
                    name: { type: 'string' },
                    address: { type: 'object' },
                    areaLabel: { type: 'string' },
                    location: { type: 'object' },
                    weeklyHours: { type: 'array' },
                    courts: { type: 'array' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Venue created' } },
        },
      },
      '/api/v1/venues/mine': {
        get: {
          tags: ['Venues'],
          summary: 'Get all venues owned by current venue owner',
          security: [{ bearerAuth: [] }],
          responses: { '200': { description: 'Owned venues' } },
        },
      },
      '/api/v1/venues/{id}': {
        get: {
          tags: ['Venues'],
          summary: 'Get venue details by ID (Public)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Venue details' } },
        },
        patch: {
          tags: ['Venues'],
          summary: 'Update venue basic details (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Venue updated' } },
        },
      },
      '/api/v1/venues/{id}/courts': {
        post: {
          tags: ['Venues - Courts'],
          summary: 'Add a new court to venue (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'sportKeys'],
                  properties: {
                    name: { type: 'string' },
                    sportKeys: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Court added' } },
        },
      },
      '/api/v1/venues/{id}/courts/{courtId}': {
        patch: {
          tags: ['Venues - Courts'],
          summary: 'Update court properties or deactivation (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'courtId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          },
          responses: { '200': { description: 'Court updated' } },
        },
      },
      '/api/v1/venues/{id}/hours': {
        put: {
          tags: ['Venues - Hours'],
          summary: 'Set weekly opening hours (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['weeklyHours'],
                  properties: {
                    weeklyHours: { type: 'array' },
                    adminOverrideReason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Weekly hours updated' } },
        },
      },
      '/api/v1/venues/{id}/closures': {
        post: {
          tags: ['Venues - Closures'],
          summary: 'Add a temporary venue closure window (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['startsAt', 'endsAt', 'reason'],
                  properties: {
                    startsAt: { type: 'string', format: 'date-time' },
                    endsAt: { type: 'string', format: 'date-time' },
                    reason: { type: 'string' },
                    adminOverrideReason: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '201': { description: 'Closure added' } },
        },
      },
      '/api/v1/venues/{id}/closures/{closureId}': {
        delete: {
          tags: ['Venues - Closures'],
          summary: 'Remove closure window (Owner or Admin)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'closureId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Closure removed' } },
        },
      },
      '/api/v1/venues/{id}/availability': {
        get: {
          tags: ['Venues'],
          summary: 'Get venue availability slots for a date (Public)',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
          ],
          responses: { '200': { description: 'Availability slots' } },
        },
      },
      '/api/v1/venues/{id}/approve': {
        post: {
          tags: ['Admin - Venues'],
          summary: 'Approve pending venue (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Venue approved' } },
        },
      },
      '/api/v1/venues/{id}/suspend': {
        post: {
          tags: ['Admin - Venues'],
          summary: 'Suspend active venue (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: { reason: { type: 'string' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Venue suspended' } },
        },
      },
      '/api/v1/venues/{id}/reinstate': {
        post: {
          tags: ['Admin - Venues'],
          summary: 'Reinstate suspended venue (Admin only)',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { '200': { description: 'Venue reinstated' } },
        },
      },
      '/api/v1/recommendations': {
        get: {
          tags: ['Recommendations'],
          summary: 'Get personalized game recommendations',
          description:
            'Evaluates candidate games based on skill match, geographic proximity, calendar availability, and host reliability.',
          security: [{ bearerAuth: [] }],
          parameters: [
            { $ref: '#/components/parameters/ClientTypeHeader' },
            { $ref: '#/components/parameters/RequestIdHeader' },
            {
              name: 'sportKey',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Filter recommendations by sport',
            },
            {
              name: 'limit',
              in: 'query',
              required: false,
              schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
              description: 'Maximum number of recommendations to return',
            },
            {
              name: 'maxDistanceKm',
              in: 'query',
              required: false,
              schema: { type: 'number' },
              description: 'Maximum distance in km from user home location',
            },
            {
              name: 'minScore',
              in: 'query',
              required: false,
              schema: { type: 'number', minimum: 0, maximum: 1 },
              description: 'Minimum match score threshold',
            },
          ],
          responses: {
            '200': {
              description: 'Recommendations retrieved successfully',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RecommendationsResponse' },
                },
              },
            },
            '401': {
              description: 'Authentication required',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
            '404': {
              description: 'Player profile not found',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiErrorResponse' },
                },
              },
            },
          },
        },
      },
    },
  };

  // Sort paths alphabetically for deterministic output
  const sortedPaths: Record<string, any> = {};
  for (const pathKey of Object.keys(spec.paths).sort()) {
    sortedPaths[pathKey] = (spec.paths as any)[pathKey];
  }
  spec.paths = sortedPaths as any;

  return spec;
}

export function writeOpenAPISpec() {
  const spec = generateOpenAPISpec();
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
  console.log(`OpenAPI specification generated successfully at ${outputPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeOpenAPISpec();
}
