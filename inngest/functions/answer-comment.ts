import { inngest } from '../client';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';
import { retrieveContext } from '@/modules/ai/lib/rag';
import { generateChatPrompt } from '@/modules/ai/lib/pr-chat-prompt';
import { fetchProjectConfig } from '@/modules/config/fetch-config';

export const answerPrComment = inngest.createFunction(
  { id: 'answer-pr-comment', concurrency: 10 },
  { event: 'pr.comment' },
  async ({ event, step }) => {
    const { owner, repo, commentId, body, prNumber, repoId, isBot } = event.data;

    // 1. FILTER: Ignore bots and comments not mentioning us
    if (isBot) return { message: 'Ignored bot comment' };
    if (!body.toLowerCase().includes('@codespecter-ai-review'))
      return { message: 'Ignored: No mention' };

    console.log(`💬 CodeSpecter mentioned in PR #${prNumber}`);

    // 2. AUTHENTICATE
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

    // 3. FETCH FULL PR CONTEXT (All Files Changed)
    // We get the specific PR details + ALL diffs to give the AI "God Mode" vision
    const prContext = await step.run('fetch-diff-context', async () => {
      // A. Get PR Title/Desc
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // B. Get ALL Changed Files (Same logic as review-pr.ts)
      const { data: files } = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100, // Fetch up to 100 files
        }
      );

      // C. Filter & Format Diffs
      const formattedDiffs = files
        .filter((file) => {
          return (
            !file.filename.match(
              /\.(lock|min\.js|min\.css|svg|png|jpg|json|map|md)$/
            ) &&
            !file.filename.includes('package-lock.json') &&
            file.status !== 'removed'
          );
        })
        .map((f) => `File: ${f.filename}\n${f.patch || ''}`)
        .join('\n\n');

      return {
        title: pr.title,
        diffs: formattedDiffs, // Contains the ENTIRE PR changes
      };
    });

    // 4. RAG SEARCH (Query Pinecone with the User's Question)
    const ragDocs = await step.run('rag-lookup', async () => {
      // We look for context relevant to the user's specific question
      const query = `Question: ${body}. PR Context: ${prContext.title}`;
      const matches = await retrieveContext(query, repoId.toString());
      return matches.join('\n\n');
    });

    // 5. CONFIG LOAD
    const config = await step.run('fetch-config', async () => {
      return await fetchProjectConfig(octokit, owner, repo);
    });

    // 6. GENERATE ANSWER
    const aiResponse = await step.run('generate-answer', async () => {
      const cleanQuery = body.replace('@codespecter-ai-review', '').trim();

      // We pass the FULL PR DIFFS into the 'codeSnippet' field of the prompt
      // This tricks the prompt into treating the entire PR as the "snippet"
      const prompt = generateChatPrompt(
        prContext.title,
        'Entire Pull Request', // File Name context
        prContext.diffs,       // <-- PASSING ALL DIFFS HERE
        'User is asking a question about the PR changes above.', 
        ragDocs,
        cleanQuery,
        config
      );

      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        prompt: prompt,
        temperature: 0.3, // Slightly lower temp for more accurate technical answers
      });

      return text;
    });

    // 7. POST REPLY
    await step.run('post-reply', async () => {
      try {
        // Try replying to the thread if it's a review comment
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: commentId,
          body: aiResponse,
        });
      } catch (e) {
        // Fallback: Post as a general comment
        await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: prNumber,
          body: aiResponse,
        });
      }
    });

    return { success: true };
  }
);
