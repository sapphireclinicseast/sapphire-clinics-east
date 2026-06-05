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

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12)
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash)
}
