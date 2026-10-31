import { z } from 'zod';

// Rules from the problem statement: more than 8 characters, one uppercase, one lowercase, one special character
export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(9, 'Password must be more than 8 characters')
  .regex(/[A-Z]/, 'Password needs at least one uppercase letter')
  .regex(/[a-z]/, 'Password needs at least one lowercase letter')
  .regex(/[^A-Za-z0-9]/, 'Password needs at least one special character');

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email');

export const nameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name is too long');

// Optional text: empty string becomes null
export const optionalText = (max = 160) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const phoneSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9+\-\s]{7,15}$/.test(v), 'Enter a valid phone number');

// Money in rupees: accepts 999, "999.5"; rejects negatives, rounds to paise
export const moneySchema = (label = 'Amount') =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .refine((v) => Number.isFinite(v), `${label} must be a number`)
    .min(0, `${label} cannot be negative`)
    .max(9999999999, `${label} is too large`)
    .transform((v) => Math.round(Number((v * 100).toPrecision(15))) / 100);

// Whole number with a minimum
export const intSchema = (label, min = 0) =>
  z.coerce.number({ error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`)
    .max(1000000, `${label} is too large`);

// 'YYYY-MM-DD' date string
export const dateSchema = (label = 'Date') =>
  z
    .string({ error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine((v) => { const d = new Date(`${v}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v; }, `${label} must be a real date`)
    .refine((v) => v >= '2000-01-01' && v <= '2100-12-31', `${label} is out of range`);

export const optionalDateSchema = (label = 'Date') =>
  z
    .union([dateSchema(label), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

// Optional id (e.g. a tax): '', null, undefined become null
export const optionalIdSchema = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? Number(v) : null));
