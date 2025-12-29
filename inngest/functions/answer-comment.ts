import { inngest } from '../client';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { Octokit } from 'octokit';
import prisma from '@/lib/db';
import { retrieveContext } from '@/modules/ai/lib/rag';
import { generateChatPrompt } from '@/modules/ai/lib/pr-chat-prompt';
import { fetchProjectConfig } from '@/modules/config/fetch-config';

export const answerPrComment = inngest.createFunction(
  { id: 'answer-pr-comment', concurrency: 5 },
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

    // -------------------------------------------------------
    // STEP 2.5: CONFIG LOAD (Moved Earlier)
    // -------------------------------------------------------
    // We need config early to know where to look for guidelines
    const config = await step.run('fetch-config', async () => {
      return await fetchProjectConfig(octokit, owner, repo);
    });

    // -------------------------------------------------------
    // STEP 3: FETCH FULL PR CONTEXT (Diffs + Metadata)
    // -------------------------------------------------------
    const prContext = await step.run('fetch-diff-context', async () => {
      // A. Get PR Title/Desc
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // B. Get ALL Changed Files
      const { data: files } = await octokit.request(
        'GET /repos/{owner}/{repo}/pulls/{pull_number}/files',
        {
          owner,
          repo,
          pull_number: prNumber,
          per_page: 100,
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
        description: pr.body,
        diffs: formattedDiffs,
      };
    });

    // -------------------------------------------------------
    // STEP 4: FETCH GUIDELINES (The "Law")
    // -------------------------------------------------------
    const projectGuidelines = await step.run('fetch-guidelines', async () => {
      try {
        const pathsToFetch = config?.review?.guidelines || [];
        if (pathsToFetch.length === 0) return '';

        // Helper: Fetch single file content
        const fetchContent = async (filePath: string) => {
          try {
            const { data } = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: filePath,
            });
            if ('content' in data && !Array.isArray(data)) {
              const text = Buffer.from(data.content, 'base64').toString('utf-8');
              return `\n\n--- GUIDELINE FILE: ${filePath} ---\n${text}`;
            }
          } catch (e) {
            return ''; // Fail silently for single files
          }
          return '';
        };

        // 1. Discovery Phase (Parallel)
        const discoveryResults = await Promise.all(
          pathsToFetch.map(async (path) => {
            try {
              const { data } = await octokit.rest.repos.getContent({
                owner,
                repo,
                path,
              });
              if (Array.isArray(data)) {
                // Folder: return all .md/.txt files
                return data
                  .filter((i) => i.type === 'file' && i.name.match(/\.(md|txt)$/i))
                  .map((f) => f.path);
              } else {
                // File: return path
                return [path];
              }
            } catch (e) {
              return [];
            }
          })
        );

        // 2. Download Phase (Parallel)
        const filesToDownload = Array.from(new Set(discoveryResults.flat()));
        if (filesToDownload.length === 0) return '';

        const contentResults = await Promise.all(
          filesToDownload.map((filePath) => fetchContent(filePath))
        );

        return contentResults.join('');
      } catch (error) {
        console.error('Failed to fetch guidelines', error);
        return '';
      }
    });

    // -------------------------------------------------------
    // STEP 5: FETCH CONVERSATION HISTORY (Context)
    // -------------------------------------------------------
    const conversationHistory = await step.run('fetch-thread-history', async () => {
      // Fetch General PR Comments (Issue Comments)
      const { data: issueComments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
      });

      // Fetch Review Comments (Code-specific comments)
      const { data: reviewComments } = await octokit.rest.pulls.listReviewComments({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Normalize and Merge
      const allComments = [
        ...issueComments.map((c) => ({
          user: c.user?.login || 'Unknown',
          body: c.body || '',
          date: c.created_at,
          type: 'General Comment',
        })),
        ...reviewComments.map((c) => ({
          user: c.user?.login || 'Unknown',
          body: c.body || '',
          date: c.created_at,
          type: `Code Comment (File: ${c.path})`,
        })),
      ];

      // Sort by Date (Oldest to Newest)
      allComments.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );

      // Format as a readable script
      return allComments
        .map((c) => `[${c.date}] ${c.user} (${c.type}): ${c.body}`)
        .join('\n');
    });

    // -------------------------------------------------------
    // STEP 6: RAG SEARCH
    // -------------------------------------------------------
    const ragDocs = await step.run('rag-lookup', async () => {
      const query = `Question: ${body}. PR Context: ${prContext.title}`;
      const matches = await retrieveContext(query, repoId.toString());
      return matches.join('\n\n');
    });

    // -------------------------------------------------------
    // STEP 7: GENERATE ANSWER
    // -------------------------------------------------------
    const aiResponse = await step.run('generate-answer', async () => {
      const cleanQuery = body.replace('@codespecter-ai-review', '').trim();

      // Combine Guidelines + RAG for the "Knowledge Base" slot
      const combinedContext = `
      === 📜 PROJECT GUIDELINES (STRICT) ===
      ${projectGuidelines || 'No specific guidelines found.'}

      === 🧠 KNOWLEDGE BASE (RAG) ===
      ${ragDocs}
      `.trim();

      const prompt = generateChatPrompt(
        prContext.title,
        'Entire Pull Request',
        prContext.diffs,
        conversationHistory, // <--- Passing full thread history here
        combinedContext,     // <--- Passing Guidelines + RAG here
        cleanQuery,
        config
      );

      const { text } = await generateText({
        model: google('gemini-2.5-flash'),
        prompt: prompt,
        temperature: 0.3,
      });

      return text;
    });

    // -------------------------------------------------------
    // STEP 8: POST REPLY
    // -------------------------------------------------------
    await step.run('post-reply', async () => {
      try {
        await octokit.rest.pulls.createReplyForReviewComment({
          owner,
          repo,
          pull_number: prNumber,
          comment_id: commentId,
          body: aiResponse,
        });
      } catch (e) {
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