const EMOJI_REGEX = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

export function hasEmoji(text: string): boolean {
  if (!text) return false;
  return EMOJI_REGEX.test(text);
}

export function stripEmoji(text: string): string {
  if (!text) return '';
  return text.replace(new RegExp(EMOJI_REGEX.source, 'gu'), '').replace(/[ \t]+/g, ' ');
}

export function assertNoEmoji(text: string, contextDescription = 'output'): void {
  if (hasEmoji(text)) {
    throw new Error(`Assertion failed: Detected forbidden emoji in ${contextDescription}: "${text}"`);
  }
}

