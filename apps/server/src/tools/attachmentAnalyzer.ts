import type { TaskAttachment } from '@agent-office/shared';

export interface AttachmentInspectionResult {
  attachmentId: string;
  name: string;
  isSafe: boolean;
  rejectionReason?: string;
  fileKind: 'image' | 'code' | 'markdown' | 'document' | 'other';
  extractedText?: string;
  imagePayload?: {
    mimeType: string;
    base64Data: string;
  };
  summary: string;
  metadata: {
    lineCount?: number;
    byteSize: number;
    detectedLanguage?: string;
  };
}

export class AttachmentAnalyzer {
  private static DANGEROUS_EXTENSIONS = new Set([
    '.exe',
    '.bin',
    '.dll',
    '.so',
    '.dylib',
    '.msi',
    '.scr',
    '.bat',
    '.cmd',
    '.vbs',
    '.jar',
  ]);

  private static MALICIOUS_PATTERNS = [
    /eval\s*\(\s*base64_decode/i,
    /system\s*\(\s*\$_(GET|POST|REQUEST)/i,
    /passthru\s*\(\s*\$_(GET|POST|REQUEST)/i,
    /exec\s*\(\s*\$_(GET|POST|REQUEST)/i,
    /<script[\s\S]*?>[\s\S]*?document\.cookie[\s\S]*?<\/script>/i,
    /\/dev\/tcp\/[0-9.]+\/[0-9]+/i, // Bash reverse shell
  ];

  /**
   * Evaluates and inspects an attachment.
   * Rejects hazardous files or extracts multimodal content for AI consumption.
   */
  public static inspectAttachment(att: TaskAttachment): AttachmentInspectionResult {
    const ext = (att.name.includes('.') ? `.${att.name.split('.').pop()}` : '').toLowerCase();

    // 1. Check prohibited dangerous executable extensions
    if (this.DANGEROUS_EXTENSIONS.has(ext)) {
      return {
        attachmentId: att.id,
        name: att.name,
        isSafe: false,
        rejectionReason: `Prohibited dangerous binary executable format (${ext}). Agents will not process untrusted binaries.`,
        fileKind: 'other',
        summary: `REJECTED: Dangerous binary file type ${ext}`,
        metadata: { byteSize: att.size },
      };
    }

    // 2. Check for malicious code patterns in text content
    if (att.content) {
      for (const pattern of this.MALICIOUS_PATTERNS) {
        if (pattern.test(att.content)) {
          return {
            attachmentId: att.id,
            name: att.name,
            isSafe: false,
            rejectionReason: `Malicious payload pattern detected (${pattern.toString()}). Document rejected by security policy.`,
            fileKind: 'other',
            summary: `REJECTED: Suspicious script payload detected in ${att.name}`,
            metadata: { byteSize: att.size },
          };
        }
      }
    }

    // 3. Classify file kind
    const isImage =
      att.type === 'image' ||
      att.mimeType.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);

    if (isImage) {
      const mime = att.mimeType || (ext === '.png' ? 'image/png' : 'image/jpeg');
      let base64 = att.base64Data || '';
      if (!base64 && att.content && att.content.startsWith('data:image')) {
        base64 = att.content.split(',')[1] || '';
      }

      return {
        attachmentId: att.id,
        name: att.name,
        isSafe: true,
        fileKind: 'image',
        imagePayload: {
          mimeType: mime,
          base64Data: base64,
        },
        summary: `Image attachment: ${att.name} (${att.size} bytes, ${mime})`,
        metadata: { byteSize: att.size },
      };
    }

    // 4. Code & Markdown files
    const isMarkdown = ext === '.md' || ext === '.markdown' || att.mimeType === 'text/markdown';
    const isCode =
      ['.ts', '.js', '.jsx', '.tsx', '.php', '.py', '.json', '.sql', '.yaml', '.yml', '.env', '.sh'].includes(ext) ||
      att.type === 'code';

    const textContent = att.content || '';
    const lineCount = textContent.split('\n').length;

    let detectedLang = 'text';
    if (ext === '.ts' || ext === '.tsx') detectedLang = 'typescript';
    else if (ext === '.js' || ext === '.jsx') detectedLang = 'javascript';
    else if (ext === '.php') detectedLang = 'php';
    else if (ext === '.py') detectedLang = 'python';
    else if (ext === '.sql') detectedLang = 'sql';
    else if (ext === '.json') detectedLang = 'json';
    else if (isMarkdown) detectedLang = 'markdown';

    return {
      attachmentId: att.id,
      name: att.name,
      isSafe: true,
      fileKind: isMarkdown ? 'markdown' : isCode ? 'code' : 'document',
      extractedText: textContent,
      summary: `${isMarkdown ? 'Markdown' : detectedLang.toUpperCase()} document: ${att.name} (${lineCount} lines, ${att.size} B)`,
      metadata: {
        lineCount,
        byteSize: att.size,
        detectedLanguage: detectedLang,
      },
    };
  }

  /**
   * Prepares multimodal prompt content for Gemini LangChain Chat Model.
   */
  public static buildMultimodalMessages(
    basePrompt: string,
    inspections: AttachmentInspectionResult[]
  ): { textPrompt: string; imageAttachments: { mimeType: string; base64Data: string }[] } {
    let augmentedPrompt = basePrompt;
    const imageAttachments: { mimeType: string; base64Data: string }[] = [];

    const safeInspections = inspections.filter((i) => i.isSafe);
    const rejected = inspections.filter((i) => !i.isSafe);

    if (rejected.length > 0) {
      augmentedPrompt += `\n\n[WARNING - REJECTED HAZARDOUS ATTACHMENTS]:\n` +
        rejected.map((r) => `- ${r.name}: ${r.rejectionReason}`).join('\n');
    }

    if (safeInspections.length > 0) {
      augmentedPrompt += `\n\n[USER ATTACHMENTS & CONTEXT]:\n`;
      for (const item of safeInspections) {
        if (item.fileKind === 'image' && item.imagePayload?.base64Data) {
          imageAttachments.push(item.imagePayload);
          augmentedPrompt += `\n[Image Attachment: ${item.name} attached for visual analysis]\n`;
        } else if (item.extractedText) {
          augmentedPrompt += `\n--- Begin File: ${item.name} (${item.fileKind}) ---\n${item.extractedText}\n--- End File: ${item.name} ---\n`;
        }
      }
    }

    return { textPrompt: augmentedPrompt, imageAttachments };
  }
}

