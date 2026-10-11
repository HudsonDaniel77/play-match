import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import { ReliabilityTiers, type ReliabilityTier } from '../constants/reliability-constants.js';

export interface IPlayerReliability {
  userId: Types.ObjectId;
  score: number;
  tier: ReliabilityTier;
  gamesCounted: number;
  attendedGames: number;
  onTimeLeaves: number;
  lateLeaves: number;
  noShows: number;
  lastComputedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlayerReliabilityDocument extends IPlayerReliability, Document {
  id: string;
}

/**
 * Cached snapshot of a player's reliability. The source of truth is always
 * game_participants + game_feedback; this snapshot is recomputed from them,
 * so it can never drift or double count.
 */
export const playerReliabilitySchema = new Schema<IPlayerReliabilityDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
      unique: true,
      index: true,
    },
    score: { type: Number, required: true, min: 0, max: 100 },
    tier: { type: String, enum: Object.values(ReliabilityTiers), required: true },
    gamesCounted: { type: Number, required: true, min: 0, default: 0 },
    attendedGames: { type: Number, required: true, min: 0, default: 0 },
    onTimeLeaves: { type: Number, required: true, min: 0, default: 0 },
    lateLeaves: { type: Number, required: true, min: 0, default: 0 },
    noShows: { type: Number, required: true, min: 0, default: 0 },
    lastComputedAt: { type: Date, required: true },
  },
  {
    collection: Collections.PLAYER_RELIABILITY,
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        if (ret.userId) ret.userId = String(ret.userId);
        return ret;
      },
    },
  },
);

export const PlayerReliability: Model<IPlayerReliabilityDocument> =
  model<IPlayerReliabilityDocument>('PlayerReliability', playerReliabilitySchema);
