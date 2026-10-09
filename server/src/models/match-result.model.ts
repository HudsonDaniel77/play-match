import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import { MatchOutcomes, type MatchOutcome } from '../constants/match-outcomes.js';
import { MatchSourceTypes, type MatchSourceType } from '../constants/match-sources.js';
import { MatchStatuses, type MatchStatus } from '../constants/match-status.js';

export interface IMatchSide {
  sideKey: string;
  players: Types.ObjectId[];
  score: number;
}

export interface IMatchSource {
  type: MatchSourceType;
  id: string;
}

export interface IMatchResult {
  sport: Types.ObjectId;
  source: IMatchSource;
  sides: IMatchSide[];
  outcome: MatchOutcome;
  status: MatchStatus;
  appliedAt: Date;
  recordedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchResultDocument extends IMatchResult, Document {
  id: string;
}

const matchSideSchema = new Schema<IMatchSide>(
  {
    sideKey: {
      type: String,
      required: true,
      trim: true,
    },
    players: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    score: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const matchSourceSchema = new Schema<IMatchSource>(
  {
    type: {
      type: String,
      enum: Object.values(MatchSourceTypes),
      required: true,
    },
    id: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const matchResultSchema = new Schema<IMatchResultDocument>(
  {
    sport: {
      type: Schema.Types.ObjectId,
      ref: 'Sport',
      required: true,
      index: true,
    },
    source: {
      type: matchSourceSchema,
      required: true,
    },
    sides: {
      type: [matchSideSchema],
      required: true,
      validate: [
        (val: IMatchSide[]) => val && val.length === 2,
        'MatchResult must contain exactly two opposing sides',
      ],
    },
    outcome: {
      type: String,
      enum: Object.values(MatchOutcomes),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(MatchStatuses),
      default: MatchStatuses.APPLIED,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    collection: Collections.MATCH_RESULTS,
    timestamps: true,
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

// Compound unique index ensuring idempotency per source
matchResultSchema.index({ sport: 1, 'source.type': 1, 'source.id': 1 }, { unique: true });

export const MatchResult: Model<IMatchResultDocument> = model<IMatchResultDocument>(
  'MatchResult',
  matchResultSchema,
);
