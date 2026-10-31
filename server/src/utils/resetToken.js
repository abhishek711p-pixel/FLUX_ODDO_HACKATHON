import crypto from 'node:crypto';
import { config } from '../config.js';
import { mailEnabled, sendMail } from './mailer.js';

const TOKEN_TTL_MINUTES = 60;

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Creates a one-time reset token for a user, saves only its hash, and emails the link.
// Returns the link only in demo mode (no SMTP), so the flow can still be shown live.
export async function issueResetLink(db, user, { purpose = 'reset' } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `UPDATE users SET reset_token_hash = $1, reset_token_expires = NOW() + ($2 || ' minutes')::interval WHERE id = $3`,
    [hashToken(token), String(TOKEN_TTL_MINUTES), user.id]
  );

  const link = `${config.clientUrl}/reset-password?token=${token}`;
  const isInvite = purpose === 'invite';
  const subject = isInvite ? `Your ${config.company.name} billing account is ready` : `Reset your ${config.company.name} password`;
  const text = isInvite
    ? `Hi ${user.name},\n\nAn account was created for you on ${config.company.name} billing.\nSet your password here (valid for ${TOKEN_TTL_MINUTES} minutes):\n${link}\n`
    : `Hi ${user.name},\n\nWe received a request to reset your password.\nReset it here (valid for ${TOKEN_TTL_MINUTES} minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email.\n`;

  await sendMail({ to: user.email, subject, text });
  return mailEnabled ? null : link;
}
