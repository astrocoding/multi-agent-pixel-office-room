import { z } from 'zod';
import { AGENT_IDS, type AgentId } from '@agent-office/shared';

export const DeliverableTypeSchema = z.enum([
  'chat',
  'summary',
  'markdown_file',
  'document',
  'json',
  'technical_plan',
  'artifact',
  'action',
]);
export type DeliverableType = z.infer<typeof DeliverableTypeSchema>;

export const LanguageSchema = z.enum(['id', 'en', 'mixed']);
export type Language = z.infer<typeof LanguageSchema>;

export const ToneStyleSchema = z.enum([
  'professional',
  'casual',
  'academic',
  'technical',
  'marketing',
  'persuasive',
  'philosophical',
]);
export type ToneStyle = z.infer<typeof ToneStyleSchema>;

export const AudienceSchema = z.enum([
  'boss',
  'internal_team',
  'technical',
  'public',
  'telegram',
]);
export type Audience = z.infer<typeof AudienceSchema>;

export const DepthLevelSchema = z.enum(['concise', 'standard', 'exhaustive']);
export type DepthLevel = z.infer<typeof DepthLevelSchema>;

export const TaskRiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type TaskRiskLevel = z.infer<typeof TaskRiskLevelSchema>;

export const RequestProfileSchema = z.object({
  intentCategory: z.enum([
    'structured_command',
    'query_information',
    'code_engineering',
    'research_analysis',
    'document_creation',
    'system_action',
    'automation_task',
  ]),
  userGoal: z.string().min(1),
  deliverable: DeliverableTypeSchema.default('chat'),
  language: LanguageSchema.default('id'),
  tone: ToneStyleSchema.default('professional'),
  audience: AudienceSchema.default('boss'),
  depth: DepthLevelSchema.default('standard'),
  risk: TaskRiskLevelSchema.default('low'),
  requiresOwnerApproval: z.boolean().default(false),
  approvalReason: z.string().optional(),
  isMateriallyAmbiguous: z.boolean().default(false),
  clarificationQuestion: z.string().optional(),
  clarificationOptions: z.array(z.string()).default([]),
  targetSpecialists: z.array(z.string()).default([AGENT_IDS.LEADER]),
  outputFilePath: z.string().optional(),
  constraints: z.array(z.string()).default([]),
});
export type RequestProfile = z.infer<typeof RequestProfileSchema>;

export class IntentClassifier {
  /**
   * Deterministically classifies direct commands and high-risk operations
   * before falling back to model inference, ensuring zero-latency routing
   * and fail-closed safety for dangerous operations.
   */
  public static classifyDeterministic(text: string, channel: 'web' | 'telegram' | 'terminal' = 'web'): RequestProfile | null {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    // 1. Language detection heuristic
    const isIndonesian =
      /\b(buatkan|tolong|bagaimana|apakah|bisa|dan|atau|untuk|di|dari|ke|yang|saya|kami|bos)\b/i.test(lower);
    const language: Language = isIndonesian ? 'id' : 'en';

    // 2. High-Risk / Destructive Actions (Always require OWNER approval)
    const isDangerous =
      /\b(rm -rf|drop database|drop table|delete from|kill|shutdown|format disk|sudo|chmod 777)\b/i.test(lower) ||
      /\b(hapus database|hapus semua file|format storage)\b/i.test(lower);

    if (isDangerous) {
      return RequestProfileSchema.parse({
        intentCategory: 'system_action',
        userGoal: raw,
        deliverable: 'action',
        language,
        tone: 'technical',
        audience: channel === 'telegram' ? 'telegram' : 'boss',
        depth: 'concise',
        risk: 'critical',
        requiresOwnerApproval: true,
        approvalReason: 'Irreversible destructive command detected requiring explicit OWNER authorization.',
        isMateriallyAmbiguous: false,
        targetSpecialists: [AGENT_IDS.LEADER, AGENT_IDS.ENGINEERING],
        constraints: ['Must not execute without confirmed OWNER approval'],
      });
    }

    // 3. Artifact / File Creation Directives
    const fileCreationMatch = lower.match(
      /\b(?:buatkan file|create file|generate file|simpan ke|write to)\s+([a-zA-Z0-9_\-\.\/]+\.(?:md|json|txt|html|js|ts|py))/i
    );
    if (fileCreationMatch) {
      const outputFilePath = fileCreationMatch[1];
      const isMarkdown = outputFilePath.endsWith('.md');
      const isJson = outputFilePath.endsWith('.json');

      return RequestProfileSchema.parse({
        intentCategory: 'document_creation',
        userGoal: raw,
        deliverable: isMarkdown ? 'markdown_file' : isJson ? 'json' : 'artifact',
        language,
        tone: 'professional',
        audience: channel === 'telegram' ? 'telegram' : 'boss',
        depth: 'standard',
        risk: 'medium',
        requiresOwnerApproval: false,
        isMateriallyAmbiguous: false,
        outputFilePath,
        targetSpecialists: [AGENT_IDS.LEADER, AGENT_IDS.ENGINEERING, AGENT_IDS.QA],
        constraints: [`Write verified file to ${outputFilePath}`],
      });
    }

    // 4. Material Ambiguity Checks (e.g. extremely vague instructions like "fix it", "do something")
    const words = lower.split(/\s+/).filter(Boolean);
    const isExtremelyAmbiguous =
      words.length <= 2 &&
      (words.every((w) => /^(tolong|help|fix|perbaiki|kerjakan|do|it|process|run|execute|cek)$/i.test(w)) ||
        lower.length < 5);

    if (isExtremelyAmbiguous) {
      return RequestProfileSchema.parse({
        intentCategory: 'structured_command',
        userGoal: raw,
        deliverable: 'chat',
        language,
        tone: 'professional',
        audience: channel === 'telegram' ? 'telegram' : 'boss',
        depth: 'concise',
        risk: 'low',
        requiresOwnerApproval: false,
        isMateriallyAmbiguous: true,
        clarificationQuestion:
          language === 'id'
            ? 'Instruksi terlalu singkat. Apa tugas spesifik atau berkas target yang ingin Anda kerjakan?'
            : 'Directive is too vague. What specific task or target file would you like the team to work on?',
        clarificationOptions:
          language === 'id'
            ? ['Jalankan status office', 'Buat aplikasi/kode baru', 'Periksa log aktivitas']
            : ['Check office status', 'Create new application', 'Inspect activity logs'],
        targetSpecialists: [AGENT_IDS.LEADER],
        constraints: [],
      });
    }

    // 5. Tone classification heuristic based on explicit keywords
    let tone: ToneStyle = 'professional';
    if (/\b(academic|ilmiah|jurnal|analisis mendalam|teoritis)\b/i.test(lower)) {
      tone = 'academic';
    } else if (/\b(casual|santai|ngobrol|akrab)\b/i.test(lower)) {
      tone = 'casual';
    } else if (/\b(technical|kode|arsitektur|spesifikasi|implementasi)\b/i.test(lower)) {
      tone = 'technical';
    } else if (/\b(marketing|promosi|persuasif|penjualan|launching)\b/i.test(lower)) {
      tone = 'marketing';
    } else if (/\b(philosophical|filosofis|refleksi|makna)\b/i.test(lower)) {
      tone = 'philosophical';
    }

    // 6. Specialist Assignment Routing (Strict Domain Specialization)
    const specialists: AgentId[] = [AGENT_IDS.LEADER];
    const isEngineering = /\b(kode|code|buatkan|build|implement|scaffold|bikin|directory|direktori|folder|projek|project|api|fastify|express|laravel|crud|endpoint|endpoints|backend|frontend|script|bug|fungsi|refactor)\b/i.test(lower);
    const isTesting = /\b(test|testing|uji|pengujian|curl|audit|verifikasi|verify|check|lint|sintaks|validasi|recheck)\b/i.test(lower);
    const isResearch = /\b(research|riset|analisis|dokumentasi|docs|cari info|investigasi|pelajari|survey|benchmark)\b/i.test(lower);
    const isAutomation = /\b(otomasi|automation|jadwal|schedule|cron|daemon|background job|pipeline ci\/cd)\b/i.test(lower);
    const isMemory = /\b(memori|memory|riwayat|simpan pola|history|ingat|archive)\b/i.test(lower);

    if (isResearch && !isEngineering) {
      specialists.push(AGENT_IDS.RESEARCH);
    }
    if (isEngineering) {
      specialists.push(AGENT_IDS.ENGINEERING);
      // Any software engineering deliverable requires QA verification
      specialists.push(AGENT_IDS.QA);
    }
    if (isTesting && !specialists.includes(AGENT_IDS.QA)) {
      specialists.push(AGENT_IDS.QA);
    }
    if (isAutomation && !isEngineering) {
      specialists.push(AGENT_IDS.AUTOMATION);
    }
    if (isMemory) {
      specialists.push(AGENT_IDS.MEMORY);
    }

    // Remove duplicates
    const uniqueSpecialists = Array.from(new Set(specialists));

    return RequestProfileSchema.parse({
      intentCategory: uniqueSpecialists.includes(AGENT_IDS.ENGINEERING)
        ? 'code_engineering'
        : uniqueSpecialists.includes(AGENT_IDS.RESEARCH)
          ? 'research_analysis'
          : 'query_information',
      userGoal: raw,
      deliverable: channel === 'telegram' ? 'chat' : 'chat',
      language,
      tone,
      audience: channel === 'telegram' ? 'telegram' : 'boss',
      depth: channel === 'telegram' ? 'concise' : 'standard',
      risk: 'low',
      requiresOwnerApproval: false,
      isMateriallyAmbiguous: false,
      targetSpecialists: uniqueSpecialists,
      constraints: channel === 'telegram' ? ['Strictly no emojis on Telegram channel'] : [],
    });
  }
}
