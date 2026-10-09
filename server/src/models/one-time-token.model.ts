import { Schema, model, type Document, type Model, Types } from 'mongoose';
import { ALL_TOKEN_TYPES, type TokenType } from '../constants/token-types.js';
import { Collections } from '../constants/collections.js';

export interface IOneTimeToken {
  user: Types.ObjectId;
  type: TokenType;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOneTimeTokenDocument extends IOneTimeToken, Document {
  id: string;
  isValid(): boolean;
}

const oneTimeTokenSchema = new Schema<IOneTimeTokenDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ALL_TOKEN_TYPES,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: Collections.ONE_TIME_TOKENS,
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

oneTimeTokenSchema.methods.isValid = function (
  this: IOneTimeTokenDocument,
): boolean {
  return !this.usedAt && this.expiresAt > new Date();
};

export const OneTimeToken: Model<IOneTimeTokenDocument> =
  model<IOneTimeTokenDocument>('OneTimeToken', oneTimeTokenSchema);
