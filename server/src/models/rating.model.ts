import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import { config } from '../config/index.js';

export interface IRating {
  user: Types.ObjectId;
  sport: Types.ObjectId;
  rating: number;
  seedRating: number;
  seedBandKey: string;
  gamesPlayed: number;
  peakRating: number;
  wins: number;
  losses: number;
  draws: number;
  lastRatedAt: Date | null;
  /** @deprecated Superseded by RatingEvent ledger in Module 3 */
  history: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IRatingDocument extends IRating, Document {
  id: string;
  isProvisional(): boolean;
}

const ratingSchema = new Schema<IRatingDocument>(
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
    rating: {
      type: Number,
      required: true,
    },
    seedRating: {
      type: Number,
      required: true,
    },
    seedBandKey: {
      type: String,
      required: true,
    },
    gamesPlayed: {
      type: Number,
      default: 0,
      min: 0,
    },
    peakRating: {
      type: Number,
      default: function (this: IRatingDocument) {
        return this.rating;
      },
    },
    wins: {
      type: Number,
      default: 0,
      min: 0,
    },
    losses: {
      type: Number,
      default: 0,
      min: 0,
    },
    draws: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastRatedAt: {
      type: Date,
      default: null,
    },
    history: {
      type: [Schema.Types.Mixed],
      default: [],
    },
  },
  {
    collection: Collections.RATINGS,
    timestamps: true,
    toJSON: {
      transform(doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        ret.provisional = doc.gamesPlayed < config.PROVISIONAL_GAMES_THRESHOLD;
        ret.peakRating = doc.peakRating ?? doc.rating;
        ret.wins = doc.wins ?? 0;
        ret.losses = doc.losses ?? 0;
        ret.draws = doc.draws ?? 0;
        ret.lastRatedAt = doc.lastRatedAt ?? null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        ret.provisional = doc.gamesPlayed < config.PROVISIONAL_GAMES_THRESHOLD;
        ret.peakRating = doc.peakRating ?? doc.rating;
        ret.wins = doc.wins ?? 0;
        ret.losses = doc.losses ?? 0;
        ret.draws = doc.draws ?? 0;
        ret.lastRatedAt = doc.lastRatedAt ?? null;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

ratingSchema.methods.isProvisional = function (this: IRatingDocument): boolean {
  return this.gamesPlayed < config.PROVISIONAL_GAMES_THRESHOLD;
};

// Unique compound index: one rating track per user per sport
ratingSchema.index({ user: 1, sport: 1 }, { unique: true });

export const Rating: Model<IRatingDocument> = model<IRatingDocument>(
  'Rating',
  ratingSchema,
);
