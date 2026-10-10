export interface Clock {
  now(): Date;
  nowMs(): number;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}

export class TestClock implements Clock {
  private currentTime: Date;

  constructor(initialTime?: Date | string | number) {
    this.currentTime = initialTime ? new Date(initialTime) : new Date('2026-06-01T10:00:00.000Z');
  }

  now(): Date {
    return new Date(this.currentTime.getTime());
  }

  nowMs(): number {
    return this.currentTime.getTime();
  }

  setTime(time: Date | string | number): void {
    this.currentTime = new Date(time);
  }

  advanceByMs(ms: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + ms);
  }

  advanceByMinutes(minutes: number): void {
    this.advanceByMs(minutes * 60 * 1000);
  }

  advanceByHours(hours: number): void {
    this.advanceByMs(hours * 60 * 60 * 1000);
  }

  advanceByDays(days: number): void {
    this.advanceByMs(days * 24 * 60 * 60 * 1000);
  }
}

export const defaultClock: Clock = new SystemClock();
