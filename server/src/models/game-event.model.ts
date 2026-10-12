import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { Collections } from '../constants/collections.js';
import {
  GameEventTypes,
  type GameEventType,
} from '../constants/game-constants.js';

export interface IGameEvent {
  gameId: Types.ObjectId;
  type: GameEventType;
  actorId?: Types.ObjectId | null;
  payload?: Record<string, unknown>;
  createdAt: Date;
}

export interface IGameEventDocument extends IGameEvent, Document {
  id: string;
}

export const gameEventSchema = new Schema<IGameEventDocument>(
  {
    gameId: {
      type: Schema.Types.ObjectId,
      ref: Collections.GAMES,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(GameEventTypes),
      required: true,
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: Collections.USERS,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete (ret as any)._id;
        return ret;
      },
    },
  },
);

// Append-only timeline index
gameEventSchema.index({ gameId: 1, createdAt: 1 });

export const GameEvent: Model<IGameEventDocument> = model<IGameEventDocument>(
  Collections.GAME_EVENTS,
  gameEventSchema,
);
