/**
 * Security & Safety Layer for Agent Database Queries & Prompt Injection Defense
 */

export class QuerySafety {
  private static readonly TASK_ID_REGEX = /^(task_)?([a-zA-Z0-9_-]{1,64})$/i;
  private static readonly VALID_STATUSES = new Set([
    'draft',
    'analyzing',
    'planned',
    'in_progress',
    'completed',
    'failed',
    'needs_clarification',
    'all',
  ]);

  /**
   * Validates and normalizes task ID (e.g. "task_972", "972", "#task_972").
   * Returns normalized string or null if invalid.
   */
  public static normalizeAndValidateTaskId(rawId: string): string | null {
    if (!rawId || typeof rawId !== 'string') return null;
    const cleaned = rawId.trim().replace(/^[#@]/, '');
    if (!this.TASK_ID_REGEX.test(cleaned)) {
      return null;
    }
    // If it's pure numbers, normalize to task_<num> if standard in system, or keep raw cleaned
    return cleaned;
  }

  /**
   * Validates task status against strict allowlist.
   */
  public static validateStatus(rawStatus?: string): string | null {
    if (!rawStatus) return null;
    const lower = rawStatus.trim().toLowerCase();
    return this.VALID_STATUSES.has(lower) ? lower : null;
  }

  /**
   * Sanitizes search terms for LIKE / ILIKE queries to prevent wildcard abuse or injection.
   */
  public static sanitizeSearchTerm(rawTerm?: string): string {
    if (!rawTerm || typeof rawTerm !== 'string') return '';
    // Strip control chars and characters that could cause SQL wildcard issues if unescaped
    return rawTerm
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[%_\\]/g, (match) => `\\${match}`)
      .trim()
      .slice(0, 100);
  }

  /**
   * Clamps numeric limit safely.
   */
  public static clampLimit(limit?: number, defaultLimit = 10, maxLimit = 50): number {
    if (typeof limit !== 'number' || isNaN(limit) || limit < 1) {
      return defaultLimit;
    }
    return Math.min(Math.floor(limit), maxLimit);
  }

  /**
   * Sanitizes text from DB before passing to Agent LLM context to prevent Prompt Injection.
   * Strips malicious system override commands, markdown breaks, and wraps in safe isolation delimiters.
   */
  public static wrapInSafeContainer(tag: string, data: Record<string, unknown> | string): string {
    const rawString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

    // Defense against LLM jailbreak / prompt injection markers
    const sanitized = rawString
      .replace(/<\/?system>/gi, '[tag:system]')
      .replace(/<\/?instruction>/gi, '[tag:instruction]')
      .replace(/<\/?admin>/gi, '[tag:admin]')
      .replace(/ignore\s+all\s+previous\s+instructions/gi, '[neutralized_override_token]')
      .replace(/disregard\s+all\s+prior\s+instructions/gi, '[neutralized_override_token]')
      .replace(/you\s+are\s+now\s+in\s+developer\s+mode/gi, '[neutralized_devmode_token]');

    return `<safe_${tag}_record integrity="verified">\n${sanitized}\n</safe_${tag}_record>`;
  }
}

