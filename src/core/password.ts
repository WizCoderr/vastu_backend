import bcrypt from 'bcryptjs';
import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$argon2')) {
    return argon2.verify(storedHash, password);
  }
  return bcrypt.compare(password, storedHash);
}

export async function needsRehash(storedHash: string): Promise<boolean> {
  return !storedHash.startsWith('$argon2');
}
