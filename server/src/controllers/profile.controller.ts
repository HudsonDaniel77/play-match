import type { Request, Response, NextFunction } from 'express';
import { profileService, recordStepCompletion } from '../services/profile.service.js';
import { sportProfileService } from '../services/sport-profile.service.js';
import { onboardingService } from '../services/onboarding.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { Messages } from '../constants/messages.js';
import { OnboardingSteps } from '../constants/onboarding-steps.js';

export class ProfileController {
  public getMyProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const profile = await profileService.getOrCreateProfile(userId);
      const sports = await sportProfileService.getPlayerSports(userId);
      const ratings = await sportProfileService.getPlayerRatings(userId);

      sendSuccess(res, { profile, sports, ratings });
    } catch (error) {
      next(error);
    }
  };

  public updateBasicInfo = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await profileService.updateBasicInfo(req.user!.id, req.body);
      sendSuccess(res, { profile }, Messages.PROFILE_UPDATED_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public updateSports = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const result = await sportProfileService.replacePlayerSports(
        userId,
        req.body.sports,
      );

      // Record step completion in profile
      const profile = await profileService.getOrCreateProfile(userId);
      recordStepCompletion(profile, OnboardingSteps.SPORTS);
      await profile.save();

      sendSuccess(res, result, Messages.PROFILE_UPDATED_SUCCESS);
    } catch (error) {
      next(error);
    }
  };

  public updateAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await profileService.updateAvailability(
        req.user!.id,
        req.body.slots,
      );
      sendSuccess(
        res,
        { availability: profile.availability },
        Messages.PROFILE_UPDATED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  };

  public updateLocation = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await profileService.updateLocation(req.user!.id, req.body);
      sendSuccess(
        res,
        {
          homeLocation: profile.homeLocation,
          locationLabel: profile.locationLabel,
          travelRadiusKm: profile.travelRadiusKm,
        },
        Messages.PROFILE_UPDATED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  };

  public updatePreferences = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await profileService.updatePreferences(
        req.user!.id,
        req.body,
      );
      sendSuccess(
        res,
        { visibility: profile.visibility },
        Messages.PROFILE_UPDATED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  };

  public getOnboarding = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const status = await onboardingService.getStatus(req.user!.id);
      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  };

  public completeOnboarding = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const profile = await onboardingService.completeOnboarding(req.user!.id);
      sendSuccess(
        res,
        { profile, onboarding: profile.onboarding },
        Messages.ONBOARDING_COMPLETED_SUCCESS,
      );
    } catch (error) {
      next(error);
    }
  };

  public getMyRatings = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ratings = await sportProfileService.getPlayerRatings(req.user!.id);
      sendSuccess(res, { ratings });
    } catch (error) {
      next(error);
    }
  };

  public getPublicProfile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const publicProfile = await profileService.getPublicProfile(
        req.params.userId,
      );
      sendSuccess(res, publicProfile);
    } catch (error) {
      next(error);
    }
  };
}

export const profileController = new ProfileController();
