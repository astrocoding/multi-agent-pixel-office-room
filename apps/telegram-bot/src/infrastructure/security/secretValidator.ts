import crypto from 'crypto';

export class SecretValidator {
  public static verifyWebhookSecret(
    providedSecret: string | undefined | null,
    expectedSecret: string
  ): boolean {
    if (!providedSecret || !expectedSecret) return false;

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(expectedSecret);

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    try {
      return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
}

