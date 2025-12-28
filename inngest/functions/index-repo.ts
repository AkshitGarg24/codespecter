import { inngest } from '../client';
import {
  fetchFileContentBatch,
  getRepoFileStructure,
} from '@/modules/github/lib/github';
import { indexCodebase } from '@/modules/ai/lib/rag';
import prisma from '@/lib/db';

export const indexRepo = inngest.createFunction(
  { id: 'index-repo', concurrency: 1 },
  { event: 'repository.indexing' },
  async ({ event, step }) => {
    const { owner, repo, repoId, userId } = event.data;

    console.log(`🚀 Starting indexing for ${owner}/${repo} (ID: ${repoId})`);

    // 1. Fetch Token
    const token = await step.run('fetch-token', async () => {
      const account = await prisma.account.findFirst({
        where: { userId, providerId: 'github' },
      });
      if (!account?.accessToken)
        throw new Error('No Github Access Token Found.');
      return account.accessToken;
    });

    // 2. Get File List
    const filePaths = await step.run('fetch-file-paths', async () => {
      const paths = await getRepoFileStructure(token, owner, repo);
      console.log(`📂 Found ${paths.length} files`);
      return paths;
    });

    if (filePaths.length === 0) {
      return { success: true, filesIndexed: 0, message: 'Empty repo' };
    }

    // 3. Process in Batches
    const BATCH_SIZE = 10;
    let totalIndexed = 0;

    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batchId = `index-batch-${i}`;

      // ✅ FIX: Capture the return value from the step
      const batchCount = await step.run(batchId, async () => {
        const batchPaths = filePaths.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i}..${i + BATCH_SIZE}`);

        const files = await fetchFileContentBatch(
          token,
          owner,
          repo,
          batchPaths
        );

        if (files.length === 0) return 0; // Return 0 if empty

        // Pass repoId.toString() for namespace
        await indexCodebase(repoId.toString(), files);

        // ✅ Return the count FROM the step
        return files.length;
      });

      // ✅ Update the counter OUTSIDE the step
      // Even if Inngest skips the step logic (memoized), it returns 'batchCount'
      totalIndexed += batchCount;
    }

    console.log(`✅ Indexing complete. Total: ${totalIndexed}`);
    return { success: true, filesIndexed: totalIndexed };
  }
);
