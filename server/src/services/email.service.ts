import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    if (config.EMAIL_TRANSPORT === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        },
      });
    }
  }

  /**
   * Generic sender method handling both SMTP and console simulation.
   */
  public async sendEmail(options: EmailOptions): Promise<void> {
    if (config.EMAIL_TRANSPORT === 'console' || config.NODE_ENV === 'test') {
      logger.info(
        {
          to: options.to,
          subject: options.subject,
          transport: 'console',
        },
        `[EmailService:Console] Email to ${options.to} | Subject: "${options.subject}"\n${options.text}`,
      );
      return;
    }

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: config.EMAIL_FROM,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
        });
        logger.info({ to: options.to, subject: options.subject }, 'Email sent successfully via SMTP');
      } catch (error) {
        logger.error({ error, to: options.to, subject: options.subject }, 'Failed to deliver email via SMTP');
        // Do not throw unhandled exception to prevent breaking the auth flow for the user
      }
    }
  }

  /**
   * Sends email verification link with one-time token.
   */
  public async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const verificationUrl = `${config.CLIENT_WEB_URL}/verify-email?token=${encodeURIComponent(token)}`;
    const subject = 'Verify your PlayMatch account';
    const text = `Hello ${name},\n\nWelcome to PlayMatch! Please verify your email by clicking the link below:\n${verificationUrl}\n\nThis link will expire in ${config.EMAIL_TOKEN_TTL}.\n\nIf you did not create an account, you can safely ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2b6cb0;">Welcome to PlayMatch, ${name}!</h2>
        <p>Please click the button below to verify your email address and activate your account:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Email Address</a>
        </div>
        <p style="color: #718096; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p style="color: #a0aec0; font-size: 12px; margin-top: 30px;">This link will expire in ${config.EMAIL_TOKEN_TTL}. If you did not create a PlayMatch account, please ignore this email.</p>
      </div>
    `;

    await this.sendEmail({ to, subject, text, html });
  }

  /**
   * Sends password reset link with one-time token.
   */
  public async sendPasswordResetEmail(to: string, name: string, token: string): Promise<void> {
    const resetUrl = `${config.CLIENT_WEB_URL}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(to)}`;
    const subject = 'Reset your PlayMatch password';
    const text = `Hello ${name},\n\nWe received a request to reset your password for your PlayMatch account.\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in ${config.PASSWORD_RESET_TOKEN_TTL}.\n\nIf you did not request a password reset, you can safely ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #2b6cb0;">Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>We received a request to reset your PlayMatch account password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #e53e3e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #718096; font-size: 14px;">Or copy and paste this link into your browser:<br/><a href="${resetUrl}">${resetUrl}</a></p>
        <p style="color: #a0aec0; font-size: 12px; margin-top: 30px;">This link will expire in ${config.PASSWORD_RESET_TOKEN_TTL}. If you did not request a password reset, your password remains secure and no action is required.</p>
      </div>
    `;

    await this.sendEmail({ to, subject, text, html });
  }
}

export const emailService = new EmailService();
