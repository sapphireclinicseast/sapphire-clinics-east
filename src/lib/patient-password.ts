// Helpers for the optional self-service patient portal login.
// Passwords are bcrypt-hashed and stored on Patient.passwordHash.

import bcrypt from 'bcryptjs'

export const MIN_PASSWORD_LEN = 8

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Password is required'
  if (pw.length < MIN_PASSWORD_LEN) return `Password must be at least ${MIN_PASSWORD_LEN} characters`
  if (pw.length > 200) return 'Password is too long'
  return null
}

// Usernames are the portal login handle. Stored lower-cased so uniqueness and
// login are effectively case-insensitive.
export function normalizeUsername(u: unknown): string {
  return typeof u === 'string' ? u.trim().toLowerCase() : ''
}

export function validateUsername(u: string): string | null {
  if (!u) return 'Username is required'
  if (u.length < 3) return 'Username must be at least 3 characters'
  if (u.length > 30) return 'Username is too long'
  if (!/^[a-z0-9._-]+$/.test(u)) return 'Username can only use letters, numbers, and . _ -'
  return null
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12)
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}
