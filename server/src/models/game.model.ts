import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  GameStatuses,
  JoinPolicies,
  GameVisibilities,
  CancellationReasonCodes,
  type GameStatus,
  type JoinPolicy,
  type GameVisibility,
  type CancellationReasonCode,
} from '../constants/game-constants.js';

export interface IGameLocation {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
  addressName?: string;
}

export interface IRatingRange {
  min: number;
  max: number;
  allowUnrated: boolean;
}

export interface IStatusHistoryEntry {
  fromStatus?: GameStatus | null;
  toStatus: GameStatus;
  changedAt: Date;
  changedBy?: Types.ObjectId | null;
  reason?: string;
}

export interface ICancellationInfo {
  reasonCode: CancellationReasonCode;
  reasonText?: string;
  cancelledAt: Date;
  cancelledBy: Types.ObjectId;
}

export interface IGame {
  hostId: Types.ObjectId;
  sportKey: string;
  formatKey: string;
  status: GameStatus;
  joinPolicy: JoinPolicy;
  visibility: GameVisibility;
  inviteCode?: string;
  minPlayers: number;
  maxPlayers: number;
  participantCount: number;
  waitlistCount: number;
  startsAt: Date;
  endsAt: Date;
  location: IGameLocation;
  courtName?: string;
  ratingRange?: IRatingRange;
  isLocked: boolean;
  notes?: string;
  statusHistory: IStatusHistoryEntry[];
  cancellation?: ICancellationInfo;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGameDocument extends IGame, Document {
  id: string;
}

const locationSchema = new Schema<IGameLocation>(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (val: number[]) =>
          Array.isArray(val) &&
          val.length === 2 &&
          val[0] >= -180 &&
          val[0] <= 180 &&
          val[1] >= -90 &&
          val[1] <= 90,
        message: 'Coordinates must be valid [longitude, latitude] numbers',
      },
    },
    addressName: { type: String, trim: true },
  },
  { _id: false },
);

const ratingRangeSchema = new Schema<IRatingRange>(
  {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    allowUnrated: { type: Boolean, default: true },
  },
  { _id: false },
);

const statusHistoryEntrySchema = new Schema<IStatusHistoryEntry>(
  {
    fromStatus: {
      type: String,
      enum: Object.values(GameStatuses),
    },
    toStatus: {
      type: String,
      enum: Object.values(GameStatuses),
      required: true,
    },
    changedAt: { type: Date, required: true, default: Date.now },
    changedBy: { type: Schema.Types.ObjectId, ref: Collections.USERS },
    reason: { type: String, trim: true },
  },
  { _id: false },
);

const cancellationInfoSchema = new Schema<ICancellationInfo>(
  {
    reasonCode: {
      type: String,
      enum: Object.values(CancellationReasonCodes),
      required: true,
    },
    reasonText: { type: String, trim: true },
    cancelledAt: { type: Date, required: true },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
    },
  },
  { _id: false },
);

export const gameSchema = new Schema<IGameDocument>(
  {
    hostId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      required: true,
      index: true,
    },
    sportKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    formatKey: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(GameStatuses),
      default: GameStatuses.OPEN,
      required: true,
      index: true,
    },
    joinPolicy: {
      type: String,
      enum: Object.values(JoinPolicies),
      default: JoinPolicies.OPEN,
      required: true,
    },
    visibility: {
      type: String,
      enum: Object.values(GameVisibilities),
      default: GameVisibilities.PUBLIC,
      required: true,
      index: true,
    },
    inviteCode: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
      unique: true,
    },
    minPlayers: {
      type: Number,
      required: true,
      min: 2,
    },
    maxPlayers: {
      type: Number,
      required: true,
      min: 2,
    },
    participantCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    waitlistCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    startsAt: {
      type: Date,
      required: true,
      index: true,
    },
    endsAt: {
      type: Date,
      required: true,
      index: true,
    },
    location: {
      type: locationSchema,
      required: true,
    },
    courtName: {
      type: String,
      trim: true,
    },
    ratingRange: {
      type: ratingRangeSchema,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
    statusHistory: {
      type: [statusHistoryEntrySchema],
      default: [],
    },
    cancellation: {
      type: cancellationInfoSchema,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? ret._id.toString() : undefined;
        delete ret._id;
        return ret;
      },
    },
  },
);

// Indexes
gameSchema.index({ location: '2dsphere' });
gameSchema.index({ status: 1, startsAt: 1 });
gameSchema.index({ sportKey: 1, status: 1, startsAt: 1 });
gameSchema.index({ hostId: 1, startsAt: -1 });

export const Game: Model<IGameDocument> = model<IGameDocument>(
  Collections.GAMES,
  gameSchema,
);
