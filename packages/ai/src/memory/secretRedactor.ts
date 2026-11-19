export interface RedactionResult {
  redactedText: string;
  detectedCount: number;
  secretTypes: string[];
}

export class SecretRedactor {
  private static readonly PATTERNS: Array<{
    name: string;
    regex: RegExp;
    replacement: string;
  }> = [
    // Private Keys
    {
      name: 'private_key',
      regex: /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g,
      replacement: '[REDACTED_PRIVATE_KEY]',
    },
    // Database Connection Strings with Passwords
    {
      name: 'database_connection_url',
      regex: /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/([^:]+):([^@\s]+)@/gi,
      replacement: '$1://$2:[REDACTED_DB_PASSWORD]@',
    },
    // Google / Gemini API Keys
    {
      name: 'google_api_key',
      regex: /\bAIza[0-9A-Za-z-_]{35}\b/g,
      replacement: '[REDACTED_GOOGLE_API_KEY]',
    },
    // OpenAI API Keys
    {
      name: 'openai_api_key',
      regex: /\bsk-(?:proj-|live-)?[a-zA-Z0-9_-]{32,}\b/g,
      replacement: '[REDACTED_OPENAI_KEY]',
    },
    // GitHub Tokens
    {
      name: 'github_token',
      regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b|\bgithub_pat_[a-zA-Z0-9_]{50,}\b/g,
      replacement: '[REDACTED_GITHUB_TOKEN]',
    },
    // AWS Access Key ID
    {
      name: 'aws_access_key',
      regex: /\b(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g,
      replacement: '[REDACTED_AWS_KEY]',
    },
    // Slack Tokens
    {
      name: 'slack_token',
      regex: /\bxox[baprs]-[0-9a-zA-Z]{10,48}\b/g,
      replacement: '[REDACTED_SLACK_TOKEN]',
    },
    // Generic Bearer Tokens
    {
      name: 'bearer_token',
      regex: /\bBearer\s+[a-zA-Z0-9_\-\.]{24,}\b/gi,
      replacement: 'Bearer [REDACTED_BEARER_TOKEN]',
    },
    // JWT Tokens
    {
      name: 'jwt_token',
      regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
      replacement: '[REDACTED_JWT_TOKEN]',
    },
    // Password / Secret in assignments
    {
      name: 'credential_assignment',
      regex: /(?:password|secret|api_key|apikey|token|auth_token)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
      replacement: 'password: "[REDACTED_SECRET]"',
    },
  ];

  /**
   * Scans input text and replaces discovered secrets, API keys, and credentials
   * with safe placeholders before persisting to memory or generating embeddings.
   */
  public static redact(text: string): RedactionResult {
    let result = text;
    let detectedCount = 0;
    const detectedTypes = new Set<string>();

    for (const pattern of this.PATTERNS) {
      const matches = result.match(pattern.regex);
      if (matches && matches.length > 0) {
        detectedCount += matches.length;
        detectedTypes.add(pattern.name);
        result = result.replace(pattern.regex, pattern.replacement);
      }
    }

    return {
      redactedText: result,
      detectedCount,
      secretTypes: Array.from(detectedTypes),
    };
  }

  /**
   * Quick predicate to check if text contains known sensitive patterns.
   */
  public static containsSecret(text: string): boolean {
    return this.PATTERNS.some((p) => p.regex.test(text));
  }
}

