export const SESSION_COOKIES = {
  accessToken: "ht_access",
  refreshToken: "ht_refresh",
  userId: "ht_user_id",
  username: "ht_username",
} as const;

export const ACCESS_MAX_AGE = 15 * 60;
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

export function sessionCookieOptions(maxAge: number, production: boolean) {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}
