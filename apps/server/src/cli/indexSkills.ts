#!/usr/bin/env node
import path from 'node:path';
import 'dotenv/config';
import { initDatabase } from '../db/schema.js';
import { IncrementalIngestionService } from '../rag/incrementalIngestService.js';
import { DbSkillRepository } from '../rag/dbSkillRepository.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Agent Office Room - Skill Indexing CLI (Phase 1 RAG)
===================================================
Usage:
  pnpm run index:skills [options]
  pnpm run index:skills:dry-run

Options:
  --dry-run             Scan filesystem and calculate changes without modifying the database
  --dir <path>          Custom path to the skills root directory (default: ./skills)
  --approve <slug>      Approve a registered skill slug (e.g. --approve humanizer)
  --help, -h            Show this help message

Security & Approval Policy:
  - Newly discovered skills default to 'proposed' and 'unreviewed_proposal'.
  - Only 'approved' skills can be loaded as procedural instructions for agents.
  - Path traversal (..) and symlink escapes outside the allowlisted root are strictly blocked.
  - No executable code or embedded scripts are run during ingestion.
    `);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');

  let skillsDir = path.resolve(process.cwd(), 'skills');
  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    skillsDir = path.resolve(args[dirIdx + 1]);
  }

  const approveIdx = args.indexOf('--approve');
  const approveSlug = approveIdx !== -1 && args[approveIdx + 1] ? args[approveIdx + 1] : null;

  console.log(`[RAG Indexer] Starting ${dryRun ? 'DRY-RUN' : 'LIVE'} skill ingestion...`);
  console.log(`[RAG Indexer] Skills Root: ${skillsDir}`);

  try {
    if (!dryRun) {
      console.log('[RAG Indexer] Ensuring database schema is initialized...');
      await initDatabase();
    }

    if (approveSlug && !dryRun) {
      console.log(`[RAG Indexer] Explicitly approving skill '${approveSlug}'...`);
      await DbSkillRepository.updateSkillStatus(approveSlug, 'approved', 'cli_admin');
      console.log(`[RAG Indexer] Skill '${approveSlug}' is now APPROVED.`);
      process.exit(0);
    }

    const service = new IncrementalIngestionService(skillsDir);
    const result = await service.ingest({
      dryRun,
      autoApproveSlugs: ['humanizer'], // Humanizer is seeded as approved local skill
      approver: 'admin_indexer',
    });

    console.log('\n================ INGESTION SUMMARY ================');
    console.log(`Mode:            ${result.dryRun ? 'DRY-RUN (No DB modifications)' : 'LIVE EXECUTION'}`);
    console.log(`Total Discovered:${result.totalDiscovered}`);
    console.log(`Newly Indexed:   ${result.indexed.length}`);
    for (const f of result.indexed) {
      console.log(`  + [INDEXED]   ${f}`);
    }
    console.log(`Updated:         ${result.updated.length}`);
    for (const f of result.updated) {
      console.log(`  * [UPDATED]   ${f}`);
    }
    console.log(`Skipped (Unchg): ${result.skipped.length}`);
    for (const f of result.skipped) {
      console.log(`  = [UNCHANGED] ${f}`);
    }
    console.log(`Tombstoned:      ${result.tombstoned.length}`);
    for (const f of result.tombstoned) {
      console.log(`  - [TOMBSTONE] ${f}`);
    }
    console.log(`Quarantined:     ${result.quarantined.length}`);
    for (const q of result.quarantined) {
      console.log(`  ! [QUARANTINE] ${q.path}: ${q.reason}`);
    }
    console.log('====================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('[RAG Indexer] FATAL ERROR during ingestion:', err);
    process.exit(1);
  }
}

main();

