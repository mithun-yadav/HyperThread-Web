import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username."),
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(30, "Username must be 30 characters or fewer.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores."),
  email: z.email("Enter a valid email address.").trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password must be 128 characters or fewer.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/\d/, "Include a number."),
});

export const loginResponseSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const refreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});

export const accessClaimsSchema = z.object({
  sub: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
});

export const registerResponseSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  email: z.email(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export type AuthSession = {
  userId: string;
  username: string;
};

export type ClientApiError = {
  message: string;
  errorCode?: string;
};
