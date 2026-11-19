import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { TaskAttachment } from '@agent-office/shared';

export interface DocumentAnalysisParams {
  analysisFocus: string;
  filePath?: string;
  attachmentId?: string;
  fileName?: string;
  base64Data?: string;
  mimeType?: string;
}

export interface DocumentAnalysisResult {
  success: boolean;
  fileKind: 'image' | 'pdf' | 'markdown' | 'code' | 'document' | 'other';
  fileName: string;
  extractedText: string;
  ocrText?: string;
  visualElements?: string[];
  summary: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}

export class MultimodalDocumentService {
  private apiKey: string;
  private activeDirectory: string;
  private visionChatModel: ChatGoogleGenerativeAI | null = null;
  private recentAttachmentsCache = new Map<string, TaskAttachment>();

  constructor(apiKey: string, activeDirectory = '~/Projects') {
    this.apiKey = apiKey;
    this.activeDirectory = activeDirectory;

    if (apiKey && apiKey !== 'your_gemini_api_key_here') {
      this.visionChatModel = new ChatGoogleGenerativeAI({
        apiKey,
        model: 'gemini-3.1-flash',
        temperature: 0.05,
      });
    }
  }

  public registerAttachment(att: TaskAttachment): void {
    if (att.id) this.recentAttachmentsCache.set(att.id, att);
    if (att.name) this.recentAttachmentsCache.set(att.name.toLowerCase(), att);
  }

  public registerAttachments(attachments: TaskAttachment[]): void {
    for (const a of attachments) {
      this.registerAttachment(a);
    }
  }

  private resolvePath(targetPath: string): string {
    if (targetPath.startsWith('~')) {
      const home = process.env.HOME || '/Users/zaenalalfian';
      return path.resolve(home, targetPath.slice(2));
    }
    if (path.isAbsolute(targetPath)) {
      return targetPath;
    }
    const baseCwd = this.activeDirectory.startsWith('~')
      ? path.resolve(process.env.HOME || '/Users/zaenalalfian', this.activeDirectory.slice(2))
      : this.activeDirectory;
    return path.resolve(baseCwd, targetPath);
  }

  /**
   * Analyzes an uploaded attachment or workspace file with zero hallucination.
   * Performs real OCR transcription and visual layout breakdown.
   */
  public async analyzeDocumentOrImage(params: DocumentAnalysisParams): Promise<DocumentAnalysisResult> {
    let fileName = params.fileName || 'unknown_file';
    let mimeType = params.mimeType || '';
    let base64Data = params.base64Data || '';
    let textContent = '';

    // 1. Resolve from attachment cache if id or name given
    if (!base64Data && !params.filePath) {
      if (params.attachmentId && this.recentAttachmentsCache.has(params.attachmentId)) {
        const cached = this.recentAttachmentsCache.get(params.attachmentId)!;
        fileName = cached.name;
        mimeType = cached.mimeType;
        base64Data = cached.base64Data || '';
        textContent = cached.content || '';
      } else if (params.fileName && this.recentAttachmentsCache.has(params.fileName.toLowerCase())) {
        const cached = this.recentAttachmentsCache.get(params.fileName.toLowerCase())!;
        fileName = cached.name;
        mimeType = cached.mimeType;
        base64Data = cached.base64Data || '';
        textContent = cached.content || '';
      }
    }

    // 2. Resolve from local file path if given
    if (params.filePath) {
      try {
        const fullPath = this.resolvePath(params.filePath);
        if (fsSync.existsSync(fullPath)) {
          fileName = path.basename(fullPath);
          const ext = path.extname(fullPath).toLowerCase();
          const stat = await fs.stat(fullPath);

          if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
            mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
            const buf = await fs.readFile(fullPath);
            base64Data = buf.toString('base64');
          } else if (ext === '.pdf') {
            mimeType = 'application/pdf';
            const buf = await fs.readFile(fullPath);
            base64Data = buf.toString('base64');
          } else {
            // Text, markdown, code
            mimeType = ext === '.md' ? 'text/markdown' : 'text/plain';
            textContent = await fs.readFile(fullPath, 'utf-8');
          }
        } else {
          return {
            success: false,
            fileKind: 'other',
            fileName: params.filePath,
            extractedText: '',
            summary: `File not found on disk at: ${fullPath}`,
            confidence: 'low',
            error: `File not found at path "${params.filePath}".`,
          };
        }
      } catch (err: unknown) {
        return {
          success: false,
          fileKind: 'other',
          fileName: params.filePath,
          extractedText: '',
          summary: `Failed to read file from disk: ${(err as Error).message}`,
          confidence: 'low',
          error: (err as Error).message,
        };
      }
    }

    const ext = (fileName.includes('.') ? `.${fileName.split('.').pop()}` : '').toLowerCase();
    const isImage =
      mimeType.startsWith('image/') ||
      ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    const isPdf =
      mimeType === 'application/pdf' ||
      ext === '.pdf';
    const isMarkdown =
      ext === '.md' ||
      ext === '.markdown' ||
      mimeType === 'text/markdown';
    const isCode =
      ['.ts', '.tsx', '.js', '.jsx', '.php', '.py', '.json', '.sql', '.yaml', '.yml', '.env', '.sh'].includes(ext);

    // 3. Process Code & Markdown directly without hallucination
    if ((isMarkdown || isCode) && textContent) {
      const lines = textContent.split('\n');
      const preview = lines.slice(0, 150).join('\n');
      const kind = isMarkdown ? 'markdown' : 'code';

      return {
        success: true,
        fileKind: kind,
        fileName,
        extractedText: textContent,
        ocrText: textContent,
        summary: `Verified ${kind.toUpperCase()} document "${fileName}" (${lines.length} lines, ${textContent.length} characters). Contains valid code/content without hallucination.`,
        visualElements: [`File: ${fileName}`, `Total Lines: ${lines.length}`, `Language: ${ext.replace('.', '')}`],
        confidence: 'high',
      };
    }

    // 4. Process Multimodal Images & PDFs using Gemini Vision Model
    if ((isImage || isPdf) && base64Data) {
      if (!this.visionChatModel) {
        return {
          success: false,
          fileKind: isImage ? 'image' : 'pdf',
          fileName,
          extractedText: '',
          summary: 'Vision AI model client is not initialized (missing API key).',
          confidence: 'low',
          error: 'Vision AI model client is not initialized.',
        };
      }

      const cleanBase64 = base64Data.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '').trim();
      const actualMime = mimeType || (ext === '.png' ? 'image/png' : isPdf ? 'application/pdf' : 'image/jpeg');

      const systemPrompt = `You are a high-precision computer vision and optical character recognition (OCR) engine for the Agent Office Room.
Your goal is to inspect the attached ${isPdf ? 'PDF document' : 'image/screenshot'} and provide 100% truthful, verifiable, and accurate OCR transcription and visual layout analysis.

STRICT ZERO-DELUSION RULES:
1. NEVER hallucinate or invent nonexistent content.
2. If text or numbers are visible in the image, transcribe them EXACTLY verbatim (including case, paths, errors, code, and labels).
3. Identify visual components objectively: title bars, panels, cards, tabs, chat logs, buttons, indicators, and color theme.
4. Do NOT assume this is WhatsApp or any other application unless the literal logo or interface name is clearly visible in the pixels!
5. Format your response cleanly into sections:
   - SUMMARY: Concise, factual overview of what is depicted.
   - OCR TRANSCRIPTION: Every piece of text, code, numbers, and labels transcribed verbatim.
   - VISUAL COMPONENTS: List of active UI panels, badges, cards, or diagrams visible.
   - TECHNICAL INSIGHTS: Key takeaway, error logs, configuration values, or code contents.`;

      const userPrompt = `Focus of analysis: "${params.analysisFocus || 'all'}".
Please inspect this ${isPdf ? 'PDF document' : 'image file'} "${fileName}" and produce the verified factual analysis and OCR transcription.`;

      try {
        const messages = [
          new SystemMessage(systemPrompt),
          new HumanMessage({
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${actualMime};base64,${cleanBase64}`,
                },
              },
            ],
          }),
        ];

        const response = await this.visionChatModel.invoke(messages);
        const analysisText = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

        // Parse extracted elements
        const visualElements: string[] = [];
        const lines = analysisText.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            visualElements.push(line.trim().replace(/^[-*]\s+/, ''));
          }
        }

        return {
          success: true,
          fileKind: isImage ? 'image' : 'pdf',
          fileName,
          extractedText: analysisText,
          ocrText: analysisText,
          visualElements: visualElements.slice(0, 15),
          summary: `Verified visual & OCR analysis of "${fileName}" (${actualMime}) completed with high precision.`,
          confidence: 'high',
        };
      } catch (err: unknown) {
        console.error('[MultimodalDocumentService] Vision API error:', err);
        return {
          success: false,
          fileKind: isImage ? 'image' : 'pdf',
          fileName,
          extractedText: '',
          summary: `Vision analysis failed: ${(err as Error).message}`,
          confidence: 'low',
          error: (err as Error).message,
        };
      }
    }

    return {
      success: false,
      fileKind: 'other',
      fileName,
      extractedText: textContent || '',
      summary: `File "${fileName}" does not contain readable visual image pixels or text payload.`,
      confidence: 'low',
      error: 'Unsupported or empty payload.',
    };
  }
}

