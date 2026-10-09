import { Types } from 'mongoose';
import { profileService, recordStepCompletion } from './profile.service.js';
import { SportProfile } from '../models/sport-profile.model.js';
import {
  ALL_ONBOARDING_STEPS,
  OnboardingSteps,
  OnboardingStatuses,
  type OnboardingStatus,
} from '../constants/onboarding-steps.js';
import { ValidationError } from '../utils/app-error.js';
import { Messages } from '../constants/messages.js';
import { ErrorCodes } from '../constants/error-codes.js';
import type { IProfileDocument } from '../models/profile.model.js';

export interface OnboardingStatusReport {
  status: OnboardingStatus;
  completedSteps: string[];
  missingSteps: string[];
  isComplete: boolean;
  completedAt: Date | null;
}

export class OnboardingService {
  /**
   * Evaluates onboarding progress and identifies any missing steps.
   */
  public async getStatus(
    userId: string | Types.ObjectId,
  ): Promise<OnboardingStatusReport> {
    const profile = await profileService.getOrCreateProfile(userId);
    const activeSportsCount = await SportProfile.countDocuments({
      user: new Types.ObjectId(userId),
      isActive: true,
    });

    // Sports step requires at least 1 active sport profile
    const completedSet = new Set(profile.onboarding.completedSteps);
    if (activeSportsCount > 0) {
      completedSet.add(OnboardingSteps.SPORTS);
    } else {
      completedSet.delete(OnboardingSteps.SPORTS);
    }

    const completedSteps = Array.from(completedSet);
    const missingSteps = ALL_ONBOARDING_STEPS.filter(
      (step) => !completedSet.has(step),
    );

    const isComplete =
      missingSteps.length === 0 &&
      profile.onboarding.status === OnboardingStatuses.COMPLETED;

    return {
      status: profile.onboarding.status,
      completedSteps,
      missingSteps,
      isComplete,
      completedAt: profile.onboarding.completedAt,
    };
  }

  /**
   * Finalizes the onboarding flow after ensuring all required steps are satisfied.
   */
  public async completeOnboarding(
    userId: string | Types.ObjectId,
  ): Promise<IProfileDocument> {
    const statusReport = await this.getStatus(userId);

    if (statusReport.missingSteps.length > 0) {
      throw new ValidationError(
        `${Messages.ONBOARDING_INCOMPLETE} (Missing: ${statusReport.missingSteps.join(', ')})`,
        { missingSteps: statusReport.missingSteps },
      );
    }

    const profile = await profileService.getOrCreateProfile(userId);
    profile.onboarding.status = OnboardingStatuses.COMPLETED;
    profile.onboarding.completedAt = new Date();
    await profile.save();

    return profile;
  }
}

export const onboardingService = new OnboardingService();
