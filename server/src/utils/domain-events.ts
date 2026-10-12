import { EventEmitter } from 'events';
import { logger } from './logger.js';
import type { GameEventType } from '../constants/game-constants.js';

export interface DomainEventPayload<T = unknown> {
  type: GameEventType | string;
  gameId: string;
  actorId?: string;
  timestamp: Date;
  data?: T;
}

export type DomainEventListener<T = unknown> = (event: DomainEventPayload<T>) => void | Promise<void>;

class DomainEventEmitter {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<T = unknown>(event: DomainEventPayload<T>): void {
    logger.debug({ eventType: event.type, gameId: event.gameId }, 'Domain event dispatched');
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  on<T = unknown>(eventType: string, listener: DomainEventListener<T>): void {
    this.emitter.on(eventType, listener);
  }

  off<T = unknown>(eventType: string, listener: DomainEventListener<T>): void {
    this.emitter.off(eventType, listener);
  }

  removeAllListeners(eventType?: string): void {
    if (eventType) {
      this.emitter.removeAllListeners(eventType);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}

export const domainEvents = new DomainEventEmitter();

/**
 * EventBuffer holds domain events during a database transaction,
 * and only dispatches them after the transaction successfully commits.
 */
export class TransactionEventBuffer {
  private events: DomainEventPayload[] = [];

  buffer(event: DomainEventPayload): void {
    this.events.push(event);
  }

  commit(): void {
    for (const event of this.events) {
      domainEvents.emit(event);
    }
    this.events = [];
  }

  clear(): void {
    this.events = [];
  }
}
