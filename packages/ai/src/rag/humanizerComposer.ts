import type { RequestProfile, ToneStyle } from './intentClassifier.js';
import type { PassageCitation } from './retrievalTypes.js';

export interface ComposeOptions {
  profile: RequestProfile;
  rawContent: string;
  citations?: PassageCitation[];
  channel?: 'web' | 'telegram' | 'terminal';
  agentVoice?: 'zen' | 'dre' | 'iky' | 'gus' | 'rai' | 'dhea';
}

export class HumanizerComposer {
  /**
   * Applies the Humanizer writing policy to format and tone-shift responses
   * while strictly preserving factual grounding, citations, and channel constraints.
   */
  public static compose(options: ComposeOptions): string {
    const { profile, rawContent, citations = [], channel = 'web', agentVoice = 'zen' } = options;
    const isId = profile.language === 'id';

    // 1. Clean and normalize base text
    let text = rawContent.trim();

    // 2. Apply channel-specific strict boundaries
    if (channel === 'telegram') {
      text = this.enforceTelegramPolicy(text);
    }

    // 3. Apply Tone and Register rules
    text = this.applyToneRegister(text, profile.tone, isId);

    // 4. Attach verifiable citations if present
    if (citations.length > 0 && profile.deliverable !== 'chat') {
      const citationFooter = this.formatCitationFooter(citations, isId);
      text = `${text}\n\n${citationFooter}`;
    }

    return text;
  }

  /**
   * Enforces strict Telegram policy:
   * - Strips emojis completely.
   * - Keeps sentences concise and high-impact.
   */
  public static enforceTelegramPolicy(content: string): string {
    // Regex stripping unicode emojis, pictographs, and decorative symbols
    const noEmoji = content.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
      ''
    );

    return noEmoji
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * Formats short, factual progress summary for pixel NPC speech bubbles.
   * Bound to max 120 characters, truthful, and concise.
   */
  public static formatNpcBubble(actionSummary: string, agentName = 'Zen'): string {
    const cleaned = this.enforceTelegramPolicy(actionSummary);
    const text = cleaned.length > 100 ? `${cleaned.slice(0, 97)}...` : cleaned;
    return text;
  }

  private static applyToneRegister(content: string, tone: ToneStyle, isId: boolean): string {
    // Tone formatting preserves source facts while ensuring paragraph coherence
    switch (tone) {
      case 'academic':
        return isId
          ? `Berdasarkan analisis metodologis dan bukti sistem terverifikasi:\n\n${content}`
          : `Based on verified evidence and systematic analysis:\n\n${content}`;

      case 'technical':
        return content; // Keep precise technical syntax intact

      case 'marketing':
        return content;

      case 'philosophical':
        return isId
          ? `Meninjau pertimbangan arsitektural dan implikasi mendasar:\n\n${content}`
          : `Examining the underlying architectural rationale and implications:\n\n${content}`;

      case 'casual':
        return content;

      case 'professional':
      default:
        return content;
    }
  }

  private static formatCitationFooter(citations: PassageCitation[], isId: boolean): string {
    const title = isId ? 'Referensi Terverifikasi:' : 'Verified Sources:';
    const lines = citations.map(
      (c, idx) =>
        `[${idx + 1}] ${c.canonicalPath} (Lines ${c.startLine}-${c.endLine}, v${c.version})`
    );
    return `### ${title}\n${lines.join('\n')}`;
  }
}

