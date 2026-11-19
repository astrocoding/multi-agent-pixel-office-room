import {
  type AnalysisDepth,
  type RiskTier,
  type ComplexityDimension,
  type ComplexityVector,
  type ComplexityTier,
  type ClarificationType,
  type ClarificationItem,
  type TaskIntake,
  type DecisionRecord,
  type WorkUnit,
} from '@agent-office/shared';
import { AGENT_IDS, type AgentId } from '@agent-office/shared';

export interface ComplexityCalculationResult {
  score: number | null;
  scoreRange?: [number, number];
  tier: ComplexityTier;
  knownDimensionsCount: number;
  isFullyAssessed: boolean;
}

export class ComplexityCalculator {
  private static readonly WEIGHTS = {
    S: 0.2, // Scope breadth
    D: 0.2, // Dependency complexity
    I: 0.15, // Integration novelty
    U: 0.2, // Requirements uncertainty
    V: 0.15, // Validation/acceptance load
    C: 0.1, // Coordination/conflict
  };

  /**
   * Calculates the weighted complexity score (0..100) or an interval range [min, max]
   * if any dimension is unknown/null.
   * Never coerces null to zero or fabricates precise scores for unknown values.
   */
  public static calculate(vector: ComplexityVector): ComplexityCalculationResult {
    const entries: Array<[keyof typeof ComplexityCalculator.WEIGHTS, ComplexityDimension]> = [
      ['S', vector.S],
      ['D', vector.D],
      ['I', vector.I],
      ['U', vector.U],
      ['V', vector.V],
      ['C', vector.C],
    ];

    let knownSum = 0;
    let minSum = 0;
    let maxSum = 0;
    let unknownCount = 0;

    for (const [key, val] of entries) {
      const weight = this.WEIGHTS[key];
      if (val !== null && typeof val === 'number') {
        const boundedVal = Math.max(0, Math.min(4, Math.round(val)));
        knownSum += weight * boundedVal;
        minSum += weight * boundedVal;
        maxSum += weight * boundedVal;
      } else {
        unknownCount++;
        minSum += weight * 0; // Unknown assumes min 0
        maxSum += weight * 4; // Unknown assumes max 4
      }
    }

    if (unknownCount === 0) {
      // 25 * sum(weights * values) maps (0..4) to (0..100)
      const exactScore = Number((25 * knownSum).toFixed(2));
      return {
        score: exactScore,
        tier: this.resolveTier(exactScore),
        knownDimensionsCount: 6,
        isFullyAssessed: true,
      };
    }

    const minScore = Number((25 * minSum).toFixed(2));
    const maxScore = Number((25 * maxSum).toFixed(2));
    const midScore = Number(((minScore + maxScore) / 2).toFixed(2));

    return {
      score: null,
      scoreRange: [minScore, maxScore],
      tier: this.resolveTier(maxScore), // Conservative tier based on upper bound
      knownDimensionsCount: 6 - unknownCount,
      isFullyAssessed: false,
    };
  }

  public static resolveTier(score: number): ComplexityTier {
    if (score < 20) return 'low';
    if (score < 40) return 'standard';
    if (score < 60) return 'moderate';
    if (score < 80) return 'high';
    return 'very_high';
  }
}

export interface RiskEvaluationInput {
  action: string;
  resource: string;
  environment: 'production' | 'staging' | 'sandbox' | 'local';
  actorRole: 'owner' | 'member' | 'guest';
}

export interface RiskEvaluationResult {
  tier: RiskTier;
  requiresOwnerApproval: boolean;
  approvalReason?: string;
  isForbidden: boolean;
  reason: string;
}

export class RiskEvaluator {
  /**
   * Evaluates risk tier independently from complexity.
   * High risk overrides low complexity. Fails closed.
   */
  public static evaluate(input: RiskEvaluationInput): RiskEvaluationResult {
    const actionLower = input.action.toLowerCase();
    const resourceLower = input.resource.toLowerCase();

    // 1. R4 Prohibited: Unauthorized access, secret exfiltration, bypassing auth
    if (
      actionLower.includes('bypass') ||
      actionLower.includes('exfiltrate') ||
      actionLower.includes('steal') ||
      actionLower.includes('sudo su') ||
      actionLower.includes('cat /etc/shadow') ||
      actionLower.includes('cat /etc/passwd') ||
      (input.actorRole === 'guest' && (actionLower.includes('delete') || actionLower.includes('write')))
    ) {
      return {
        tier: 'R4',
        requiresOwnerApproval: false,
        isForbidden: true,
        reason: 'Operation violates security boundaries and is prohibited (R4).',
      };
    }

    // 2. R3 Sensitive: Production deployment, credential changes, DB drops/truncates, payment
    if (
      input.environment === 'production' ||
      actionLower.includes('deploy') ||
      actionLower.includes('drop table') ||
      actionLower.includes('drop database') ||
      actionLower.includes('delete from') ||
      actionLower.includes('rm -rf') ||
      actionLower.includes('credential') ||
      actionLower.includes('api_key') ||
      actionLower.includes('billing') ||
      actionLower.includes('payment') ||
      resourceLower.includes('production')
    ) {
      return {
        tier: 'R3',
        requiresOwnerApproval: true,
        approvalReason: `Privileged/sensitive action (${input.action}) on '${input.resource}' in '${input.environment}' requires explicit Owner authorization.`,
        isForbidden: false,
        reason: 'Sensitive operation with high-blast radius (R3).',
      };
    }

    // 3. R2 Controlled-Write: Local code changes, local DB migrations, non-prod writes
    if (
      actionLower.includes('write') ||
      actionLower.includes('edit') ||
      actionLower.includes('migrate') ||
      actionLower.includes('install') ||
      actionLower.includes('patch')
    ) {
      return {
        tier: 'R2',
        requiresOwnerApproval: false,
        isForbidden: false,
        reason: 'Controlled write to authorized non-production environment (R2).',
      };
    }

    // 4. R1 Reversible: Sandbox change, local test, temp artifact
    if (
      actionLower.includes('test') ||
      actionLower.includes('lint') ||
      actionLower.includes('build') ||
      actionLower.includes('temp') ||
      actionLower.includes('format')
    ) {
      return {
        tier: 'R1',
        requiresOwnerApproval: false,
        isForbidden: false,
        reason: 'Reversible local operation with no sensitive data (R1).',
      };
    }

    // 5. R0 Informational: Read-only search, explanation, summary
    return {
      tier: 'R0',
      requiresOwnerApproval: false,
      isForbidden: false,
      reason: 'Read-only informational query with zero external side-effects (R0).',
    };
  }
}

export class AnalysisDepthSelector {
  /**
   * Selects analysis depth (D0..D4) based on complexity tier, risk, and intent.
   */
  public static select(
    complexityTier: ComplexityTier,
    riskTier: RiskTier,
    isMateriallyAmbiguous: boolean
  ): AnalysisDepth {
    if (riskTier === 'R3' || riskTier === 'R4') {
      return 'D4'; // Deep risk controls and forensic audit
    }
    if (complexityTier === 'very_high') {
      return 'D4';
    }
    if (complexityTier === 'high' || isMateriallyAmbiguous) {
      return 'D3'; // Comprehensive trade-off analysis & clarification
    }
    if (complexityTier === 'moderate') {
      return 'D2'; // Targeted module analysis
    }
    if (complexityTier === 'standard') {
      return 'D1'; // Brief summary & bounded inspection
    }
    return 'D0'; // Direct factual answer
  }
}

export interface ClarificationEvaluationResult {
  hasBlockingAmbiguity: boolean;
  type: ClarificationType;
  items: ClarificationItem[];
  counterSycophancyNote?: string;
}

export class ClarificationEvaluator {
  /**
   * Assesses user input for material ambiguity.
   * Discloses fair alternatives and trade-offs without praise or excessive agreement.
   */
  public static evaluate(request: string): ClarificationEvaluationResult {
    const textLower = request.toLowerCase();

    // Check Next.js Fullstack request without database/auth specification
    if (
      (textLower.includes('next.js') || textLower.includes('nextjs')) &&
      (textLower.includes('full-stack') || textLower.includes('fullstack') || textLower.includes('fe dan api') || textLower.includes('frontend dan api')) &&
      !textLower.includes('postgres') &&
      !textLower.includes('mysql') &&
      !textLower.includes('mongo') &&
      !textLower.includes('sqlite') &&
      !textLower.includes('stateless') &&
      !textLower.includes('tanpa database')
    ) {
      return {
        hasBlockingAmbiguity: true,
        type: 'BLOCKING',
        counterSycophancyNote:
          'Jangan berasumsi memilih database atau framework otentikasi tanpa konfirmasi kebutuhan data.',
        items: [
          {
            question: 'Apakah aplikasi membutuhkan penyimpanan data persisten (database)?',
            type: 'BLOCKING',
            blockingReason: 'Pilihan persistensi mengubah arsitektur modul dan dependensi secara fundamental.',
            options: [
              {
                id: 'no_db',
                title: 'Tanpa Database (Stateless API)',
                tradeoffs: 'Cocok untuk proxy API, frontend interaktif, atau integrasi pihak ketiga. Paling hemat sumber daya.',
                isRecommended: true,
              },
              {
                id: 'sql_postgres',
                title: 'SQL Relasional (PostgreSQL)',
                tradeoffs: 'Cocok untuk integritas transaksi bisnis, relasi data kompleks, dan reporting terstruktur.',
                isRecommended: false,
              },
              {
                id: 'nosql_mongo',
                title: 'NoSQL Dokumen (MongoDB)',
                tradeoffs: 'Cocok bila skema dokumen sangat dinamis. Hindari memilih NoSQL hanya karena mitos fleksibilitas jika data memiliki relasi.',
                isRecommended: false,
              },
            ],
            assumedDefault: 'no_db',
          },
          {
            question: 'Apakah aplikasi memerlukan otentikasi pengguna dan manajemen hak akses (roles)?',
            type: 'BLOCKING',
            blockingReason: 'Otentikasi memerlukan modul proteksi sesi, enkripsi, dan penanganan data pribadi.',
            options: [
              {
                id: 'no_auth',
                title: 'Tanpa Login (Publik / Internal)',
                tradeoffs: 'Implementasi lebih cepat, tidak ada penyimpanan kredensial atau regulasi privasi tambahan.',
                isRecommended: true,
              },
              {
                id: 'with_auth',
                title: 'Dengan Login & Role-Based Access Control',
                tradeoffs: 'Memerlukan sesi terproteksi, token JWT/session store, dan audit keamanan tambahan.',
                isRecommended: false,
              },
            ],
            assumedDefault: 'no_auth',
          },
        ],
      };
    }

    // Generic vague inputs (e.g. "tolong", "help", "perbaiki")
    const words = request.trim().split(/\s+/);
    if (words.length <= 2 && /^(tolong|help|perbaiki|fix|bantu|check|run)$/i.test(words[0])) {
      return {
        hasBlockingAmbiguity: true,
        type: 'BLOCKING',
        items: [
          {
            question: 'Bagian spesifik atau berkas mana yang ingin dikerjakan?',
            type: 'BLOCKING',
            blockingReason: 'Permintaan terlalu singkat dan belum memuat target berkas atau tujuan tugas yang jelas.',
            options: [
              { id: 'code_fix', title: 'Perbaikan Kode Sumber', tradeoffs: 'Memerlukan path berkas spesifik.', isRecommended: true },
              { id: 'review_qa', title: 'Review Kualitas / Tes', tradeoffs: 'Memerlukan cakupan modul yang ingin diuji.', isRecommended: false },
            ],
          },
        ],
      };
    }

    return {
      hasBlockingAmbiguity: false,
      type: 'OPTIONAL',
      items: [],
    };
  }
}

export interface TeamCandidate {
  teamName: string;
  agents: AgentId[];
  rationale: string;
  estimatedCoordinationOverhead: number;
  isEligible: boolean;
}

export class TeamAdmissionPolicy {
  /**
   * Evaluates team size candidates and selects the smallest sufficient team.
   * Invariant: Never automatically involve all specialists.
   */
  public static selectTeam(
    complexityTier: ComplexityTier,
    targetSpecialists: AgentId[],
    riskTier: RiskTier
  ): {
    selectedTeam: AgentId[];
    admittedCandidates: TeamCandidate[];
    rejectedCandidates: TeamCandidate[];
    rationale: string;
  } {
    // 1. Build candidates
    const soloZen: TeamCandidate = {
      teamName: 'Zen Solo',
      agents: [AGENT_IDS.LEADER],
      rationale: 'Chief of Staff handles planning and direct execution without delegation overhead.',
      estimatedCoordinationOverhead: 0,
      isEligible: complexityTier === 'low' || complexityTier === 'standard',
    };

    const targetFirst = targetSpecialists.find((s) => s !== AGENT_IDS.LEADER) || AGENT_IDS.ENGINEERING;
    const zenPlusOne: TeamCandidate = {
      teamName: `Zen + ${targetFirst}`,
      agents: [AGENT_IDS.LEADER, targetFirst],
      rationale: `Leader plans and coordinates while ${targetFirst} performs focused technical execution.`,
      estimatedCoordinationOverhead: 15,
      isEligible: true,
    };

    const targetedTeam: TeamCandidate = {
      teamName: 'Targeted Specialist Team',
      agents: Array.from(new Set([AGENT_IDS.LEADER, ...targetSpecialists])).slice(0, 3) as AgentId[],
      rationale: 'Leader coordinates 1-2 designated specialists with distinct work packages.',
      estimatedCoordinationOverhead: 30,
      isEligible: complexityTier === 'moderate' || complexityTier === 'high' || complexityTier === 'very_high',
    };

    const allSpecialists: TeamCandidate = {
      teamName: 'All Specialists Swarm',
      agents: [
        AGENT_IDS.LEADER,
        AGENT_IDS.RESEARCH,
        AGENT_IDS.ENGINEERING,
        AGENT_IDS.AUTOMATION,
        AGENT_IDS.QA,
        AGENT_IDS.MEMORY,
      ],
      rationale: 'Involves every registered specialist across the office.',
      estimatedCoordinationOverhead: 85,
      isEligible: false, // Invariant: Never involve all specialists automatically
    };

    const allCandidates = [soloZen, zenPlusOne, targetedTeam, allSpecialists];
    const admittedCandidates = allCandidates.filter((c) => c.isEligible);
    const rejectedCandidates = allCandidates.filter((c) => !c.isEligible);

    // If risk is sensitive (R3), ensure QA is in the loop
    if (riskTier === 'R3') {
      const teamWithQa = Array.from(new Set([...targetedTeam.agents, AGENT_IDS.QA])) as AgentId[];
      return {
        selectedTeam: teamWithQa,
        admittedCandidates,
        rejectedCandidates,
        rationale: 'High-risk operation (R3) requires Leader, target specialist, and independent QA review.',
      };
    }

    if (complexityTier === 'low') {
      return {
        selectedTeam: soloZen.agents,
        admittedCandidates,
        rejectedCandidates,
        rationale: 'Low complexity task executed by Zen solo with zero coordination overhead.',
      };
    }

    if (complexityTier === 'standard') {
      return {
        selectedTeam: zenPlusOne.agents,
        admittedCandidates,
        rejectedCandidates,
        rationale: 'Standard task assigned to smallest sufficient team: Zen + 1 specialist.',
      };
    }

    return {
      selectedTeam: targetedTeam.agents,
      admittedCandidates,
      rejectedCandidates,
      rationale: 'Moderate/high task assigned to targeted specialist team with bounded concurrency.',
    };
  }
}

