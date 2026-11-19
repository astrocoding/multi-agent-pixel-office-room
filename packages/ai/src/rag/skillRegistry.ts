import type { SkillMetadata, SkillStatus } from './types.js';
import { SkillTrustPolicy } from './trustPolicy.js';

export interface SkillMatchQuery {
  intent?: string;
  role?: string;
  language?: string;
  tags?: string[];
  status?: SkillStatus;
  limit?: number;
}

export interface ISkillRegistry {
  getSkill(skillId: string): Promise<SkillMetadata | null>;
  listSkills(filter?: { status?: SkillStatus; role?: string }): Promise<SkillMetadata[]>;
  listApprovedSkills(): Promise<SkillMetadata[]>;
  matchCandidateSkills(query: SkillMatchQuery): Promise<SkillMetadata[]>;
  saveSkill(skill: SkillMetadata): Promise<void>;
  updateSkillStatus(skillId: string, status: SkillStatus, approvedBy?: string): Promise<void>;
}

export class SkillRegistryService {
  /**
   * Filters and ranks candidate skills based on lexical triggers, role capabilities,
   * language compatibility, and approved status gating.
   * Note: In Phase 1, only metadata scoring is performed. Embeddings are reserved for Phase 2.
   */
  public static filterCandidateSkills(
    skills: SkillMetadata[],
    query: SkillMatchQuery
  ): SkillMetadata[] {
    const limit = query.limit || 5;
    const requiredStatus = query.status || 'approved';

    const filtered = skills.filter((skill) => {
      // 1. Status gating: default to approved only for candidate execution
      if (requiredStatus === 'approved' && !SkillTrustPolicy.isSkillApproved(skill)) {
        return false;
      }
      if (query.status && skill.status !== query.status) {
        return false;
      }

      // 2. Role filter
      if (query.role && skill.roles.length > 0 && !skill.roles.includes(query.role)) {
        return false;
      }

      // 3. Language filter
      if (query.language && skill.languages.length > 0 && !skill.languages.includes(query.language)) {
        return false;
      }

      return true;
    });

    // Score candidates by keyword / trigger match
    const scored = filtered.map((skill) => {
      let score = 0;
      const lowerIntent = (query.intent || '').toLowerCase();

      // Check direct trigger match
      if (query.tags && query.tags.length > 0) {
        for (const tag of query.tags) {
          if (skill.triggers.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            score += 10;
          }
        }
      }

      if (lowerIntent) {
        // Trigger word match in intent
        for (const trigger of skill.triggers) {
          if (lowerIntent.includes(trigger.toLowerCase())) {
            score += 5;
          }
        }

        // Skill ID or name match in intent
        if (lowerIntent.includes(skill.skillId.toLowerCase())) {
          score += 8;
        }
        if (lowerIntent.includes(skill.name.toLowerCase())) {
          score += 6;
        }
      }

      return { skill, score };
    });

    // Sort descending by score, then name
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.skill.name.localeCompare(b.skill.name);
    });

    const hasIntentFilter = !!(query.intent || (query.tags && query.tags.length > 0));
    const finalScored = hasIntentFilter ? scored.filter((s) => s.score > 0) : scored;

    return finalScored.slice(0, limit).map((s) => s.skill);
  }
}

