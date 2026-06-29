import { isValidEmail, isStrongPassword } from './validation';

describe('isValidEmail', () => {
  it('returns true for a valid email', () => {
    expect(isValidEmail('user@test.com')).toBe(true);
  });

  it('returns false for an email with no @', () => {
    expect(isValidEmail('usertest.com')).toBe(false);
  });

  it('returns false for an email with no domain', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('returns true for an 8+ character password', () => {
    expect(isStrongPassword('password123')).toBe(true);
  });

  it('returns false for a short password', () => {
    expect(isStrongPassword('abc')).toBe(false);
  });
});
