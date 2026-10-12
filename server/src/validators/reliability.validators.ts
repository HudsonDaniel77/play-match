import { z } from 'zod';
import { AttendanceStatuses, FEEDBACK_NOTE_MAX_LENGTH } from '../constants/reliability-constants.js';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const gameFeedbackParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .trim()
      .regex(objectIdRegex, 'id must be a valid 24-character hexadecimal ObjectId'),
  }),
});

export const submitFeedbackSchema = gameFeedbackParamsSchema.extend({
  body: z
    .object({
      targetUserId: z
        .string()
        .trim()
        .regex(objectIdRegex, 'targetUserId must be a valid 24-character hexadecimal ObjectId'),
      attendance: z.enum([AttendanceStatuses.ATTENDED, AttendanceStatuses.NO_SHOW], {
        errorMap: () => ({ message: 'attendance must be one of: attended, no_show' }),
      }),
      note: z.string().trim().max(FEEDBACK_NOTE_MAX_LENGTH).optional(),
    })
    .strict(),
});

export const userReliabilityParamsSchema = z.object({
  params: z.object({
    userId: z
      .string()
      .trim()
      .regex(objectIdRegex, 'userId must be a valid 24-character hexadecimal ObjectId'),
  }),
});

export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>['body'];
