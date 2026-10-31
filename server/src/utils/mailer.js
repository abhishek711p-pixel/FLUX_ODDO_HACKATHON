import nodemailer from 'nodemailer';
import { config } from '../config.js';

// Email is optional. Without SMTP settings we run in "demo mode":
// emails are printed in the server log instead of being sent.
export const mailEnabled = Boolean(config.smtp.host && config.smtp.user);

const transporter = mailEnabled
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : null;

// Demo customers use reserved example.* domains that can never receive mail.
// Skip them even when SMTP is on, so a bulk reminder does not burn the email account's daily limit.
const isFakeAddress = (to) => /@example\.(com|in|org|net)$/i.test(String(to).trim());

export async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled || isFakeAddress(to)) {
    console.log(`\n[email demo mode] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { sent: false };
  }
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text, html });
    return { sent: true };
  } catch (err) {
    // A mail failure should never break the main action (e.g. creating a customer)
    console.error('Email failed:', err.message);
    return { sent: false, error: err.message };
  }
}
