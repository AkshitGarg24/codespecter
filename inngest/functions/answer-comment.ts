import { inngest } from '../client';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';
import { retrieveContext } from '@/modules/ai/lib/rag';
import { generateChatPrompt } from '@/modules/ai/lib/pr-chat-prompt';

export const answerPrComment = inngest.createFunction(
  { id: 'answer-pr-comment', concurrency: 10 },
  { event: 'pr.comment' }, // You need to map 'issue_comment' & 'pull_request_review_comment' to this event
  async ({ event, step }) => {
    const { owner, repo, commentId, body, prNumber, repoId, isBot } =
      event.data;

    // 1. FILTER: Ignore bots and comments not mentioning us
    if (isBot) return { message: 'Ignored bot comment' };
    if (!body.toLowerCase().includes('@codespecter'))
      return { message: 'Ignored: No mention' };

    console.log(`💬 CodeSpecter mentioned in PR #${prNumber}`);

    // 2. AUTHENTICATE AS BOT
    const token = await step.run('fetch-token', async () => {
      // ... same implementation ...
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

    // 3. GATHER CONTEXT
    const contextData = await step.run('fetch-context', async () => {
      // A. Get PR Details
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // B. Get the Comment Context (Is it a general comment or a line comment?)
      // We fetch the comment to see if it has a 'diff_hunk' or path
      let diffSnippet = 'General PR Discussion (No specific line selected)';
      let path = 'General Context'; // Add this variable

      try {
        // Try fetching as a review comment first (inline code comment)
        const { data: comment } = await octokit.rest.pulls.getReviewComment({
          owner,
          repo,
          comment_id: commentId,
        });
        if (comment.diff_hunk) {
          diffSnippet = comment.diff_hunk;
          path = comment.path;
        }
      } catch (e) {
        // It might be a regular issue comment, which is fine
      }

      return {
        prTitle: pr.title,
        prDesc: pr.body,
        diffSnippet,
        path,
      };
    });

    // 4. RAG SEARCH (Query Pinecone with the User's Question)
    const ragDocs = await step.run('rag-lookup', async () => {
      const query = `Question: ${body}. Context: ${contextData.prTitle}`;
      const matches = await retrieveContext(query, repoId.toString());
      return matches.join('\n\n');
    });

    // 5. GENERATE ANSWER
    const aiResponse = await step.run('generate-answer', async () => {
      const cleanQuery = body.replace('@codespecter', '').trim();

      const prompt = generateChatPrompt(
        contextData.prTitle,
        contextData.path,
        contextData.diffSnippet, // Pass the code they commented on
        'Previous context implies code review discussion.', // You could fetch full thread history here if needed
        ragDocs,
        cleanQuery
      );

      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        prompt: prompt,
        temperature: 0.4, // Slightly higher for conversation
      });

      return text;
    });

    // 6. POST REPLY
    await step.run('post-reply', async () => {
      // We reply to the specific comment ID to keep the thread organized
      try {
        // Try replying to a review comment (inline)
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: commentId,
          body: aiResponse,
        });
      } catch (e) {
        // Fallback: Reply to a general issue comment
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
