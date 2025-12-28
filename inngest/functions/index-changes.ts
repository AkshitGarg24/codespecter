import { inngest } from '../client';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';
import { embedCode } from '@/modules/ai/lib/rag';
import { vectorStore } from '@/modules/ai/lib/vector-store'; // Ensure this matches your file path

export const indexChanges = inngest.createFunction(
  {
    id: 'index-changes',
    concurrency: 1, // Important: Run sequentially to avoid race conditions on same repo
  },
  { event: 'github/push' },
  async ({ event, step }) => {
    const { ref, repository, commits, head_commit } = event.data;
    
    // Standardize Repo ID for Vector Store (String format)
    const githubRepoId = repository.id.toString();

    // 1. Guard: Only index the default branch
    const defaultBranch = `refs/heads/${repository.default_branch}`;
    if (ref !== defaultBranch) {
      return { message: 'Skipped: Not on default branch' };
    }

    // 2. Flatten commits to find all changed files
    const addedFiles = new Set<string>();
    const modifiedFiles = new Set<string>();
    const removedFiles = new Set<string>();

    // Safety check: commits might be undefined in some push events (e.g. initial empty push)
    if (commits && Array.isArray(commits)) {
        commits.forEach((commit: any) => {
        commit.added.forEach((f: string) => addedFiles.add(f));
        commit.modified.forEach((f: string) => modifiedFiles.add(f));
        commit.removed.forEach((f: string) => removedFiles.add(f));
        });
    }

    // 3. Authenticate (Fetch Token from DB)
    const token = await step.run('fetch-token', async () => {
      // FIX: Use 'repository.id' from event payload directly
      const repoData = await prisma.repository.findUnique({
        where: { githubId: repository.id }, 
        include: { user: { include: { accounts: true } } },
      });

      if (!repoData) throw new Error(`Repository ${repository.full_name} not connected to CodeSpecter`);
      
      const account = repoData.user.accounts.find(
        (a) => a.providerId === 'github'
      );
      
      if (!account?.accessToken) throw new Error('No GitHub token found');
      return account.accessToken;
    });

    const octokit = new Octokit({ auth: token });

    // -------------------------------------------------------
    // A. HANDLE REMOVALS
    // -------------------------------------------------------
    if (removedFiles.size > 0) {
      await step.run('delete-vectors', async () => {
        for (const filePath of removedFiles) {
          await vectorStore.deleteFile(filePath, githubRepoId);
        }
      });
    }

    // -------------------------------------------------------
    // B. HANDLE ADDITIONS & UPDATES
    // -------------------------------------------------------
    const filesToIndex = [...addedFiles, ...modifiedFiles];

    // Filter ignored files (images, locks, etc.)
    const validFiles = filesToIndex.filter(
      (f) => !f.match(/\.(lock|min\.js|min\.css|svg|png|jpg|json|map|md)$/)
    );

    if (validFiles.length > 0) {
      await step.run('process-updates', async () => {
        for (const filePath of validFiles) {
          try {
            // 1. Fetch latest content
            const { data } = await octokit.rest.repos.getContent({
              owner: repository.owner.login,
              repo: repository.name,
              path: filePath,
              ref: head_commit.id, // Get the exact version pushed
            });

            if ('content' in data && !Array.isArray(data)) {
              const content = Buffer.from(data.content, 'base64').toString('utf-8');

              // 2. "Clean Slate" Rule: Always delete old vectors for this file first
              if (modifiedFiles.has(filePath)) {
                await vectorStore.deleteFile(filePath, githubRepoId);
              }

              // 3. Generate New Vectors
              const vectors = await embedCode(content, filePath, githubRepoId);

              // 4. Store
              await vectorStore.upsert(vectors, githubRepoId);
            }
          } catch (error) {
            console.error(`Failed to re-index ${filePath}`, error);
          }
        }
      });
    }

    return {
      added: addedFiles.size,
      modified: modifiedFiles.size,
      removed: removedFiles.size,
      processed: validFiles.length,
    };
  }
);