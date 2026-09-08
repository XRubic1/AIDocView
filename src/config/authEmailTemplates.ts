/**
 * Supabase Auth emails (signup confirm, password reset, invite, etc.).
 * Edited in Settings → Email; sent by the auth-send-email hook.
 */

import {
  AUTH_EMAIL_PLACEHOLDERS,
  buildAuthEmailBodyHtml,
} from './authEmailHtml'

export type AuthEmailActionType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email'
  | 'reauthentication'
  | 'password_changed_notification'
  | 'email_changed_notification'

export type AuthEmailTemplateId =
  | 'auth_signup'
  | 'auth_invite'
  | 'auth_magiclink'
  | 'auth_recovery'
  | 'auth_email_change'
  | 'auth_email_otp'
  | 'auth_reauthentication'
  | 'auth_password_changed'
  | 'auth_email_changed'

/** Map GoTrue email_action_type → Settings template id. */
export const AUTH_EMAIL_ACTION_TO_TEMPLATE: Record<AuthEmailActionType, AuthEmailTemplateId> = {
  signup: 'auth_signup',
  invite: 'auth_invite',
  magiclink: 'auth_magiclink',
  recovery: 'auth_recovery',
  email_change: 'auth_email_change',
  email: 'auth_email_otp',
  reauthentication: 'auth_reauthentication',
  password_changed_notification: 'auth_password_changed',
  email_changed_notification: 'auth_email_changed',
}

export const AUTH_EMAIL_TEMPLATE_DEFAULTS: Array<{
  id: AuthEmailTemplateId
  name: string
  description: string
  placeholders: string
  subject: string
  body_html: string
}> = [
  {
    id: 'auth_signup',
    name: 'Auth — confirm signup',
    description:
      'Supabase sends this when a carrier registers. Confirm email so they can sign in.',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Confirm your Credyx email',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Account',
      headline: 'Confirm your email',
      intro:
        'Hi {{contactName}}, thanks for creating a Credyx account for {{email}}. Confirm this address to finish signing up.',
    }),
  },
  {
    id: 'auth_invite',
    name: 'Auth — invite',
    description: 'Supabase user invite (accept invitation / set password).',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'You’re invited to Credyx',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Invitation',
      headline: 'You’re invited',
      intro:
        'Hi {{contactName}}, you’ve been invited to the Credyx portal. Open the button below to accept and set your password.',
    }),
  },
  {
    id: 'auth_magiclink',
    name: 'Auth — magic link',
    description: 'Passwordless sign-in link from Supabase.',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Your Credyx sign-in link',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Sign in',
      headline: 'Sign in to Credyx',
      intro: 'Hi {{contactName}}, use this one-time link to sign in. It expires shortly.',
    }),
  },
  {
    id: 'auth_recovery',
    name: 'Auth — password reset',
    description: 'Sent when someone requests a password reset (Forgot password).',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Reset your Credyx password',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Password',
      headline: 'Reset your password',
      intro:
        'Hi {{contactName}}, we received a request to reset the password for {{email}}. If you didn’t ask for this, you can ignore this email.',
    }),
  },
  {
    id: 'auth_email_change',
    name: 'Auth — confirm email change',
    description: 'Confirm a new email address (and current address when secure email change is on).',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Confirm your Credyx email change',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Account',
      headline: 'Confirm email change',
      intro:
        'Hi {{contactName}}, confirm this change for {{email}}. New address: {{new_email}}.',
    }),
  },
  {
    id: 'auth_email_otp',
    name: 'Auth — email code',
    description: 'One-time code (OTP) when Supabase sends type “email”.',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Your Credyx code: {{token}}',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Verification',
      headline: 'Your verification code',
      intro: 'Hi {{contactName}}, use this code to continue. It expires shortly.',
    }),
  },
  {
    id: 'auth_reauthentication',
    name: 'Auth — reauthentication code',
    description: 'Code to confirm a sensitive action (change password while signed in, etc.).',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Your Credyx verification code: {{token}}',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Verification',
      headline: 'Verify it’s you',
      intro: 'Hi {{contactName}}, use this code to confirm this action. It expires shortly.',
    }),
  },
  {
    id: 'auth_password_changed',
    name: 'Auth — password changed',
    description: 'Notice after the account password was changed.',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Your Credyx password was changed',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Security',
      headline: 'Password changed',
      intro:
        'Hi {{contactName}}, the password for {{email}} was just changed. If this wasn’t you, reset your password right away and contact Credyx.',
    }),
  },
  {
    id: 'auth_email_changed',
    name: 'Auth — email changed',
    description: 'Notice after the account email was changed.',
    placeholders: AUTH_EMAIL_PLACEHOLDERS,
    subject: 'Your Credyx email was changed',
    body_html: buildAuthEmailBodyHtml({
      eyebrow: 'Security',
      headline: 'Email changed',
      intro:
        'Hi {{contactName}}, the email on this Credyx account was changed from {{old_email}} to {{new_email}}. If this wasn’t you, contact Credyx.',
    }),
  },
]
