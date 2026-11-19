import fs from 'node:fs';
import path from 'node:path';
import type { DeliverableType } from './intentClassifier.js';

export interface ArtifactVerificationResult {
  verified: boolean;
  filePath: string;
  fileSizeBytes: number;
  formatValid: boolean;
  reason?: string;
}

export class ArtifactVerifier {
  /**
   * Verifies that a generated artifact physically exists on disk, is non-empty,
   * and adheres to its declared format/schema.
   */
  public static verify(
    targetPath: string,
    deliverableType: DeliverableType = 'artifact',
    workspaceRoot?: string
  ): ArtifactVerificationResult {
    try {
      const root = workspaceRoot ? path.resolve(workspaceRoot) : process.cwd();
      const resolvedPath = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(root, targetPath);

      if (!fs.existsSync(resolvedPath)) {
        return {
          verified: false,
          filePath: resolvedPath,
          fileSizeBytes: 0,
          formatValid: false,
          reason: `Verification failed: Artifact file '${resolvedPath}' does not exist on disk.`,
        };
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        return {
          verified: false,
          filePath: resolvedPath,
          fileSizeBytes: 0,
          formatValid: false,
          reason: `Verification failed: Path '${resolvedPath}' is a directory, not a file.`,
        };
      }

      if (stats.size === 0) {
        return {
          verified: false,
          filePath: resolvedPath,
          fileSizeBytes: 0,
          formatValid: false,
          reason: `Verification failed: Artifact file '${resolvedPath}' is empty (0 bytes).`,
        };
      }

      // Check format validity based on deliverable type
      const content = fs.readFileSync(resolvedPath, 'utf8');
      let formatValid = true;
      let reason: string | undefined;

      if (deliverableType === 'json' || resolvedPath.endsWith('.json')) {
        try {
          JSON.parse(content);
        } catch (jsonErr) {
          formatValid = false;
          reason = `JSON syntax verification failed: ${(jsonErr as Error).message}`;
        }
      } else if (deliverableType === 'markdown_file' || resolvedPath.endsWith('.md')) {
        // Markdown verification: verify valid UTF-8 string with minimal length
        if (content.trim().length < 5) {
          formatValid = false;
          reason = 'Markdown verification failed: content too short to be meaningful.';
        }
      }

      return {
        verified: formatValid,
        filePath: resolvedPath,
        fileSizeBytes: stats.size,
        formatValid,
        reason,
      };
    } catch (err: unknown) {
      return {
        verified: false,
        filePath: targetPath,
        fileSizeBytes: 0,
        formatValid: false,
        reason: `Artifact verification error: ${(err as Error).message}`,
      };
    }
  }
}

