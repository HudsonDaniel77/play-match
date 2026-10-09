import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { ALL_CLIENT_TYPES, type ClientType } from '../constants/client-types.js';
import { Collections } from '../constants/collections.js';

export interface IRefreshSession {
  user: Types.ObjectId;
  tokenHash: string;
  family: string;
  userAgent?: string | null;
  ip?: string | null;
  clientType: ClientType;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRefreshSessionDocument extends IRefreshSession, Document {
  id: string;
  isActive(): boolean;
}

const refreshSessionSchema = new Schema<IRefreshSessionDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    family: {
      type: String,
      required: true,
      index: true,
    },
    userAgent: {
      type: String,
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    clientType: {
      type: String,
      enum: ALL_CLIENT_TYPES,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    replacedBy: {
      type: Schema.Types.ObjectId,
      ref: 'RefreshSession',
      default: null,
    },
  },
  {
    collection: Collections.REFRESH_SESSIONS,
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.tokenHash;
        return ret;
      },
    },
  },
);

refreshSessionSchema.methods.isActive = function (
  this: IRefreshSessionDocument,
): boolean {
  return !this.revokedAt && !this.replacedBy && this.expiresAt > new Date();
};

export const RefreshSession: Model<IRefreshSessionDocument> =
  model<IRefreshSessionDocument>('RefreshSession', refreshSessionSchema);
