export function splitMessage(text: string, maxLength = 3500): string[] {
  if (!text || text.length <= maxLength) {
    return [text || ''];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Look for last newline before maxLength
    let splitIndex = remaining.lastIndexOf('\n', maxLength);

    // If no newline, look for last period or semicolon
    if (splitIndex < maxLength / 2) {
      const punctIndex = Math.max(
        remaining.lastIndexOf('. ', maxLength),
        remaining.lastIndexOf('; ', maxLength)
      );
      if (punctIndex > maxLength / 2) {
        splitIndex = punctIndex + 1;
      }
    }

    // If still no good break, look for last space
    if (splitIndex < maxLength / 2) {
      const spaceIndex = remaining.lastIndexOf(' ', maxLength);
      if (spaceIndex > maxLength / 2) {
        splitIndex = spaceIndex;
      }
    }

    // Hard fallback at maxLength
    if (splitIndex <= 0) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.slice(0, splitIndex).trimEnd());
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

