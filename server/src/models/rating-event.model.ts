import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { Collections } from '../constants/collections.js';

export interface IRatingEventBand {
  key: string;
  label: string;
}

export interface IRatingEvent {
  user: Types.ObjectId;
  sport: Types.ObjectId;
  matchResult: Types.ObjectId;
  oldRating: number;
  newRating: number;
  delta: number;
  expectedScore: number;
  outcomeScore: number;
  ownTeamRating: number;
  opponentTeamRating: number;
  kUsed: number;
  kBaseTier: number;
  inactivityMultiplier: number;
  movMultiplier: number;
  gamesPlayedBefore: number;
  bandBefore: IRatingEventBand;
  bandAfter: IRatingEventBand;
  voided: boolean;
  createdAt: Date;
}

export interface IRatingEventDocument extends IRatingEvent, Document {
  id: string;
}

const bandSnapshotSchema = new Schema<IRatingEventBand>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false },
);

const ratingEventSchema = new Schema<IRatingEventDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sport: {
      type: Schema.Types.ObjectId,
      ref: 'Sport',
      required: true,
      index: true,
    },
    matchResult: {
      type: Schema.Types.ObjectId,
      ref: 'MatchResult',
      required: true,
    },
    oldRating: {
      type: Number,
      required: true,
    },
    newRating: {
      type: Number,
      required: true,
    },
    delta: {
      type: Number,
      required: true,
    },
    expectedScore: {
      type: Number,
      required: true,
    },
    outcomeScore: {
      type: Number,
      required: true,
    },
    ownTeamRating: {
      type: Number,
      required: true,
    },
    opponentTeamRating: {
      type: Number,
      required: true,
    },
    kUsed: {
      type: Number,
      required: true,
    },
    kBaseTier: {
      type: Number,
      required: true,
    },
    inactivityMultiplier: {
      type: Number,
      required: true,
    },
    movMultiplier: {
      type: Number,
      required: true,
    },
    gamesPlayedBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    bandBefore: {
      type: bandSnapshotSchema,
      required: true,
    },
    bandAfter: {
      type: bandSnapshotSchema,
      required: true,
    },
    voided: {
      type: Boolean,
      default: false,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: Collections.RATING_EVENTS,
    timestamps: false,
    toJSON: {
      transform(doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Indexes
// Fast user history lookup (newest first)
ratingEventSchema.index({ user: 1, sport: 1, createdAt: -1 });

// Unique compound index: one event per participant per match
ratingEventSchema.index({ matchResult: 1, user: 1 }, { unique: true });

export const RatingEvent: Model<IRatingEventDocument> = model<IRatingEventDocument>(
  'RatingEvent',
  ratingEventSchema,
);
