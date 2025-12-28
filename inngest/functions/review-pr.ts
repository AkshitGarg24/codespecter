// src/functions/review-pr.ts

import { inngest } from '../client';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';
import { retrieveContext } from '@/modules/ai/lib/rag';
import { generateReviewPrompt } from '@/modules/ai/lib/review-pr-prompt';

export const reviewPr = inngest.createFunction(
  {
    id: 'review-pr',
    concurrency: 4,
    retries: 2,
  },
  { event: 'pr.review' },
  async ({ event, step }) => {
    const { owner, repo, prNumber, repoId, title, description } = event.data;

    // -------------------------------------------------------
    // STEP 1: Fetch Token
    // -------------------------------------------------------
    const token = await step.run('fetch-token', async () => {
      const repository = await prisma.repository.findUnique({
        where: { githubId: repoId },
        include: { user: { include: { accounts: true } } },
      });
      if (!repository) throw new Error('Repository not connected');
      const account = repository.user.accounts.find(
        (a) => a.providerId === 'github'
      );
      if (!account?.accessToken) throw new Error('No GitHub token found');
      return account.accessToken;
    });

    const octokit = new Octokit({ auth: token });

    // -------------------------------------------------------
    // STEP 2: Fetch Diff
    // -------------------------------------------------------
    const prData = await step.run('fetch-diff', async () => {
      const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: prNumber,
        }
      );

      return data
        .map((f) => ({
          filename: f.filename,
          patch: f.patch || '',
          status: f.status,
        }))
        .filter((file) => {
          return (
            !file.filename.match(
              /\.(lock|min\.js|min\.css|svg|png|jpg|json|map|md)$/
            ) &&
            !file.filename.includes('package-lock.json') &&
            file.status !== 'removed'
          );
        });
    });

    if (prData.length === 0) return { message: 'No reviewable files found.' };

    // -------------------------------------------------------
    // STEP 3: Fetch Guidelines ("The Law")
    // -------------------------------------------------------
    const projectGuidelines = await step.run('fetch-guidelines', async () => {
      try {
        const criticalFiles = [
          'BIGGER_PICTURE.md',
          'guidelines/03-api-development-standards.md',
          'guidelines/12-security-hardening.md',
        ];

        let collectedGuidelines = '';

        for (const path of criticalFiles) {
          try {
            const { data } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path,
            });

            if ('content' in data && !Array.isArray(data)) {
              const content = Buffer.from(data.content, 'base64').toString(
                'utf-8'
              );
              collectedGuidelines += `\n\n--- FILE: ${path} ---\n${content}`;
            }
          } catch (e) {
            console.warn(`Guideline file not found: ${path}`);
          }
        }

        return collectedGuidelines;
      } catch (error) {
        console.error('Failed to fetch guidelines', error);
        return '';
      }
    });

    // -------------------------------------------------------
    // STEP 4: RAG Context ("The Knowledge")
    // -------------------------------------------------------
    const contextSnippets = await step.run('fetch-rag-context', async () => {
      const allPatchesSummary = prData
        .map((f) => `File: ${f.filename}\n${f.patch || ''}`) // Add filename context
        .filter((text) => text.length < 10000) // Skip massive generated files if any slipped through
        .join('\n\n')
        .slice(0, 4000); // Increased limit to ~1000 tokens for better context retrieval

      // Put Title/Description FIRST as they contain the strongest semantic intent
      const query = `
      PR Title: ${title}
      PR Description: ${description}
      
      Code Changes Summary:
      ${allPatchesSummary}
    `.trim();

      const matches = await retrieveContext(query, repoId.toString());
      return matches.join('\n\n');
    });

    // -------------------------------------------------------
    // STEP 5: AI Analysis
    // -------------------------------------------------------
    const aiReviewText = await step.run('analyze-code', async () => {
      // 1. Prepare Data
      const prDataJSON = JSON.stringify(
        prData.map((f) => ({ name: f.filename, diff: f.patch }))
      );

      // 2. Load the System Prompt
      const detailedPrompt = generateReviewPrompt(
        title,
        description,
        projectGuidelines,
        contextSnippets,
        prDataJSON
      );

      // 3. Run Generation
      const { text } = await generateText({
        model: google('gemini-1.5-flash'), // Updated to valid model version
        prompt: detailedPrompt,
        temperature: 0.2,
      });

      return text;
    });

    // -------------------------------------------------------
    // STEP 6: Post Result
    // -------------------------------------------------------
    await step.run('post-results', async () => {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: aiReviewText,
      });
    });

    return { success: true };
  }
);