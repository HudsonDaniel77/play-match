import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import { AttendanceStatuses, type AttendanceStatus } from '../constants/reliability-constants.js';

export interface IGameFeedback {
  gameId: Types.ObjectId;
  reporterUserId: Types.ObjectId;
  targetUserId: Types.ObjectId;
  attendance: AttendanceStatus;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameFeedbackDocument extends IGameFeedback, Document {
  id: string;
}

export const gameFeedbackSchema = new Schema<IGameFeedbackDocument>(
  {
    gameId: { type: Schema.Types.ObjectId, ref: Collections.GAMES, required: true, index: true },
    reporterUserId: { type: Schema.Types.ObjectId, ref: Collections.USERS, required: true },
    targetUserId: { type: Schema.Types.ObjectId, ref: Collections.USERS, required: true },
    attendance: { type: String, enum: Object.values(AttendanceStatuses), required: true },
    note: { type: String, trim: true },
  },
  {
    collection: Collections.GAME_FEEDBACK,
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        if (ret.gameId) ret.gameId = String(ret.gameId);
        if (ret.reporterUserId) ret.reporterUserId = String(ret.reporterUserId);
        if (ret.targetUserId) ret.targetUserId = String(ret.targetUserId);
        return ret;
      },
    },
  },
);

// One feedback entry per target player per game
gameFeedbackSchema.index({ gameId: 1, targetUserId: 1 }, { unique: true });
gameFeedbackSchema.index({ targetUserId: 1, attendance: 1 });

export const GameFeedback: Model<IGameFeedbackDocument> = model<IGameFeedbackDocument>(
  'GameFeedback',
  gameFeedbackSchema,
);
