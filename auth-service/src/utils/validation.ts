export function isValidEmail(email: string): boolean {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return pattern.test(email);
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8;
}
