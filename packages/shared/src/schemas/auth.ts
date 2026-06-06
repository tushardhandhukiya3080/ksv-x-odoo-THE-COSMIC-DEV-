import { z } from 'zod';
import { Role } from '../enums.js';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[0-9]/, 'Must include a number');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  totp: z.string().length(6).optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  organizationName: z.string().min(2).max(120),
  gstin: z.string().optional(),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const forgotSchema = z.object({ email: z.string().email() });
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({
  token: z.string().min(10),
  password: passwordSchema,
});
export type ResetInput = z.infer<typeof resetSchema>;

export const verify2faSchema = z.object({
  userId: z.string(),
  totp: z.string().length(6),
});

export interface JwtPayload {
  sub: string; // userId
  organizationId: string;
  role: Role;
  email: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
}
