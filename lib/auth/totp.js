import { authenticator } from 'otplib';

export function generateTOTP(secret) {
  return authenticator.generate(secret);
}
