export interface SanitizedQuery {
  raw: string;
  cleaned: string;
  quotedPhrases: string[];
  terms: string[];
  tsqueryText: string;
  isSafe: boolean;
}

export class QuerySafety {
  private static readonly MAX_QUERY_LENGTH = 500;

  /**
   * Sanitizes and parses a search query string safely:
   * 1. Bounds length to MAX_QUERY_LENGTH.
   * 2. Extracts quoted exact phrases.
   * 3. Strips unescaped SQL / FTS syntax operators (! & | () : * < > \).
   * 4. Preserves technical file paths (e.g. SKILL.md, package.json), codes, and Indonesian/English words.
   * 5. Formats a safe plain tsquery compatible with PostgreSQL 'simple' dictionary.
   */
  public static sanitize(input: string): SanitizedQuery {
    if (!input || typeof input !== 'string') {
      return {
        raw: '',
        cleaned: '',
        quotedPhrases: [],
        terms: [],
        tsqueryText: '',
        isSafe: true,
      };
    }

    // 1. Truncate query to maximum allowed length
    const bounded = input.trim().slice(0, this.MAX_QUERY_LENGTH);

    // 2. Extract quoted phrases ("some exact phrase")
    const quotedPhrases: string[] = [];
    const phraseRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let match: RegExpExecArray | null;

    let unquoted = bounded;
    while ((match = phraseRegex.exec(bounded)) !== null) {
      const phrase = match[1].trim();
      if (phrase.length > 0) {
        quotedPhrases.push(phrase);
      }
    }

    // Replace quoted strings with whitespace in unquoted copy
    unquoted = unquoted.replace(phraseRegex, ' ');

    // 3. Remove characters that break PostgreSQL FTS / plainto_tsquery syntax
    // Retain alphanumeric, spaces, dots, dashes, underscores, and forward slashes (for file paths like SKILL.md)
    const sanitizedUnquoted = unquoted
      .replace(/[!&|()\[\]{}:;*^~%<>?'`$@=]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // 4. Split terms (min length 2 unless digit or specific identifier)
    const terms = sanitizedUnquoted
      .split(' ')
      .map((t) => t.trim())
      .filter((t) => t.length > 1 || /^\d+$/.test(t));

    // Combine terms and words from quoted phrases
    const allSearchTokens = [...terms];
    for (const phrase of quotedPhrases) {
      allSearchTokens.push(
        ...phrase
          .replace(/[!&|()\[\]{}:;*^~%<>?'`$@=]/g, ' ')
          .split(' ')
          .filter((t) => t.length > 1)
      );
    }

    const uniqueTerms = Array.from(new Set(allSearchTokens));

    // 5. Construct a safe PostgreSQL tsquery representation
    // Using plain words separated by '&' (AND) for strict match or joined cleanly
    const safeWords = uniqueTerms
      .map((w) => w.replace(/[^a-zA-Z0-9_\-\.\/]/g, ''))
      .filter((w) => w.length > 0);

    const tsqueryText = safeWords.length > 0 ? safeWords.join(' & ') : '';
    const cleaned = [sanitizedUnquoted, ...quotedPhrases].filter(Boolean).join(' ').trim();

    return {
      raw: input,
      cleaned,
      quotedPhrases,
      terms: uniqueTerms,
      tsqueryText,
      isSafe: true,
    };
  }

  /**
   * Asserts whether a query is safe to execute. Throws if query violates safety constraints.
   */
  public static validate(input: string): void {
    if (!input || input.trim().length === 0) {
      throw new Error('[QuerySafety] Search query cannot be empty.');
    }
    if (input.length > this.MAX_QUERY_LENGTH) {
      throw new Error(
        `[QuerySafety] Query length (${input.length}) exceeds maximum limit of ${this.MAX_QUERY_LENGTH} characters.`
      );
    }
  }
}

