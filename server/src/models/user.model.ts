import { Schema, model, type Document, type Model } from 'mongoose';
import { ALL_ROLES, DEFAULT_ROLE, type Role } from '../constants/roles.js';
import {
  ALL_USER_STATUSES,
  DEFAULT_USER_STATUS,
  type UserStatus,
} from '../constants/user-status.js';
import { Collections } from '../constants/collections.js';

export interface IUser {
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  isEmailVerified: boolean;
  status: UserStatus;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {
  id: string;
  isLocked(): boolean;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned in default queries
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: DEFAULT_ROLE,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ALL_USER_STATUSES,
      default: DEFAULT_USER_STATUS,
      index: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: Collections.USERS,
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
    toObject: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = ret._id ? String(ret._id) : undefined;
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

userSchema.methods.isLocked = function (this: IUserDocument): boolean {
  return Boolean(this.lockUntil && this.lockUntil > new Date());
};

export const User: Model<IUserDocument> = model<IUserDocument>(
  'User',
  userSchema,
);
