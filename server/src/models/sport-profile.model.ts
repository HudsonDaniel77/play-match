import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { Collections } from '../constants/collections.js';

export interface ISportProfile {
  user: Types.ObjectId;
  sport: Types.ObjectId;
  selectedBandKey: string;
  playStyle: string | null;
  preferredPositions: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISportProfileDocument extends ISportProfile, Document {
  id: string;
}

const sportProfileSchema = new Schema<ISportProfileDocument>(
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
    selectedBandKey: {
      type: String,
      required: true,
    },
    playStyle: {
      type: String,
      default: null,
    },
    preferredPositions: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    collection: Collections.SPORT_PROFILES,
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Unique compound index: one active profile configuration per user per sport
sportProfileSchema.index({ user: 1, sport: 1 }, { unique: true });

export const SportProfile: Model<ISportProfileDocument> =
  model<ISportProfileDocument>('SportProfile', sportProfileSchema);
