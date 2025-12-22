import { inngest } from '../client';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';

export const reviewPr = inngest.createFunction(
  { id: 'review-pr' },
  { event: 'pr.review' },
  async ({ event, step }) => {
    const { owner, repo, prNumber, repoId } = event.data;

    // -------------------------------------------------------
    // STEP 1: Fetch the Token (DB Lookup)
    // We need the token of the user who owns this repository to call GitHub API
    // -------------------------------------------------------
    const token = await step.run('fetch-token', async () => {
      const repository = await prisma.repository.findUnique({
        where: { githubId: repoId },
        include: { user: { include: { accounts: true } } },
      });

      if (!repository)
        throw new Error('Repository not connected to CodeSpecter');

      const githubAccount = repository.user.accounts.find(
        (a) => a.providerId === 'github'
      );
      if (!githubAccount?.accessToken) throw new Error('No GitHub token found');

      return githubAccount.accessToken;
    });

    const octokit = new Octokit({ auth: token });

    // -------------------------------------------------------
    // STEP 2: Fetch the Diff (The Changes)
    // -------------------------------------------------------
    const diffFiles = await step.run('fetch-diff', async () => {
      const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: prNumber,
        }
      );

      return data.map((f) => ({
        filename: f.filename,
        patch: f.patch || '', // The actual code changes (+/-)
        status: f.status, // 'added', 'modified', 'removed'
      }));
    });

    // -------------------------------------------------------
    // STEP 3: Basic File Filtering (Ignorance is Bliss)
    // -------------------------------------------------------
    const validFiles = diffFiles.filter((file) => {
      const isLockFile =
        file.filename.endsWith('lock.json') || file.filename.endsWith('.lock');
      const isMinified =
        file.filename.endsWith('.min.js') || file.filename.endsWith('.min.css');
      const isImage = file.filename.match(/\.(png|jpg|jpeg|gif|svg|ico)$/i);
      const isDeleted = file.status === 'removed';

      return !isLockFile && !isMinified && !isImage && !isDeleted;
    });

    if (validFiles.length === 0)
      return { message: 'No reviewable files found.' };

    // -------------------------------------------------------
    // STEP 4: Analyze with Gemini (Vercel AI SDK)
    // -------------------------------------------------------
    const aiResponse = await step.run('analyze-code', async () => {
      // Prompt construction
      const prompt = `
        You are an expert Senior Software Engineer. Review the following code changes from a Pull Request.
        
        FILES TO REVIEW:
        ${JSON.stringify(validFiles.map((f) => ({ name: f.filename, diff: f.patch })))}

        INSTRUCTIONS:
        1. Identify bugs, security risks, and performance issues.
        2. Ignore formatting/style nitpicks (Prettier handles that).
        3. If the code is good, do not comment.
        4. CRITICAL: Your "lineNumber" must exist in the provided diff.
      `;

      const { object } = await generateObject({
        model: google('gemini-2.5-flash'),
        schema: z.object({
          reviews: z.array(
            z.object({
              filename: z.string(),
              lineNumber: z.number(),
              comment: z.string(),
              severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
            })
          ),
        }),
        prompt: prompt,
      });

      return object.reviews;
    });

    // -------------------------------------------------------
    // STEP 5: Post Comments to GitHub
    // -------------------------------------------------------
    await step.run('post-comments', async () => {
      if (aiResponse.length === 0) return;

      // Create a "Review" object for GitHub
      // Note: GitHub expects 'path', 'line', and 'body'
      const comments = aiResponse.map((review) => ({
        path: review.filename,
        // Note: For new files, position logic is tricky.
        // For now, we use 'line' (requires specific GitHub API usage for reviews)
        // Ideally, we start a REVIEW, not individual comments.
        body: `[AI REVIEW - ${review.severity}]\n${review.comment}`,
        line: review.lineNumber,
      }));

      // We create a PENDING review with all comments
      if (comments.length > 0) {
        await octokit.request(
          'POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
          {
            owner,
            repo,
            pull_number: prNumber,
            event: 'COMMENT',
            comments: comments,
          }
        );
      }
    });

    return {
      success: true,
      reviewedFiles: validFiles.length,
      comments: aiResponse.length,
    };
  }
);
