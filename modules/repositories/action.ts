'use server';

import { getGithubToken } from '../github/lib/github';
import { fetchUserRepos } from '../github/lib/github';
import { createWebHook, deleteWebHook } from '../github/lib/webhooks';
import { parseGithubUrl } from '../github/utils/parse-github-url';
import prisma from '@/lib/db';
import { requireAuth } from '../auth/utils/auth-utils';
import { RepoListNode } from '../github/lib/types';
import { revalidatePath } from 'next/cache';
import { inngest } from '@/inngest/client';

export async function getRepositoriesAction(
  cursor?: string | null,
  query?: string,
  onlyConnected: boolean = false
) {
  const session = await requireAuth();
  const token = await getGithubToken();

  if (onlyConnected) {
    const dbRepos = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
        // Simple search logic for DB items
        name: query ? { contains: query, mode: 'insensitive' } : undefined,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Map DB shape to the UI 'RepoListNode' shape
    const nodes: RepoListNode[] = dbRepos.map((repo) => ({
      id: repo.id, // React Key
      databaseId: Number(repo.githubId),
      name: repo.name,
      stargazerCount: repo.stargazerCount,
      updatedAt: repo.updatedAt.toISOString(),
      url: repo.url,
      isPrivate: repo.isPrivate,
      isConnected: true, // Always true in this view
      primaryLanguage: repo.primaryLanguage
        ? {
          name: repo.primaryLanguage,
          color: repo.languageColor || '#ccc',
        }
        : null,
    }));

    return {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null }, // No pagination needed for DB list usually
    };
  }

  // 1. Get Data from GitHub
  const githubData = await fetchUserRepos(token, cursor, query);
  const githubNodes = githubData.nodes;

  // 2. Extract IDs to check against DB
  const githubIds = githubNodes.map((node) => node.databaseId);

  // 3. Optimized DB Check: Find only the connected repos in this batch
  const connectedRepos = await prisma.repository.findMany({
    where: {
      userId: session.user.id,
      githubId: { in: githubIds }, // BigInt comparison handled by Prisma
    },
    select: { githubId: true },
  });

  // 4. Create a Set for O(1) lookups
  // Note: We convert BigInt to Number for comparison
  const connectedSet = new Set(connectedRepos.map((r) => Number(r.githubId)));

  // 5. Merge flags into the response
  const mergedNodes: RepoListNode[] = githubNodes.map((node) => ({
    ...node,
    isConnected: connectedSet.has(node.databaseId),
  }));

  return {
    nodes: mergedNodes,
    pageInfo: githubData.pageInfo,
  };
}

export async function connectRepositoryAction(repoData: RepoListNode) {
  const token = await getGithubToken();
  const session = await requireAuth();
  const result = parseGithubUrl(repoData.url);
  if (!result) {
    return { error: 'Please provide a valid GitHub repository URL.' };
  }
  const { owner, repo } = result;
  let webhookId: number | null = null;

  try {
    webhookId = await createWebHook(token, owner, repo);

    await inngest.send({
      name: "repository.indexing",
      data: {
        owner,
        repo,
        userId: session.user.id,
        repoId: repoData.databaseId
      }
    });

    await prisma.repository.create({
      data: {
        githubId: repoData.databaseId,
        name: repoData.name,
        owner: owner,
        isPrivate: repoData.isPrivate,
        url: repoData.url,
        userId: session.user.id,
        webhookId: webhookId ? BigInt(webhookId) : null,
      },
    });

    revalidatePath('/dashboard');

    return { success: true };
  } catch (error) {
    console.error('Connect Failed:', error);
    if (webhookId) {
      console.log('Rolling back webhook...');
      await deleteWebHook(session.session.token, owner, repo, webhookId).catch(
        (e) => console.error('Failed to rollback webhook', e)
      );
    }

    return { error: 'Failed to connect repository. Please try again.' };
  }
}

export async function disconnectRepositoryAction(repoId: number) {
  const token = await getGithubToken();
  const session = await requireAuth();

  const repo = await prisma.repository.findUnique({
    where: { githubId: repoId, userId: session.user.id },
  });

  if (!repo) return { error: 'Repository not found' };

  try {
    // 1. Delete GitHub Webhook
    if (repo.webhookId) {
      // We wrap this in a try-catch so one API failure doesn't stop the DB deletion
      try {
        await deleteWebHook(token, repo.owner, repo.name, Number(repo.webhookId));
      } catch (e) {
        console.error("Failed to delete webhook from GitHub", e);
        // Continue execution...
      }
    }

    // 2. Trigger Background Vector Cleanup (Inngest)
    // We fire this BEFORE deleting from DB to ensure we have the ID, 
    // but Inngest is async so it won't block.
    await inngest.send({
      name: "repo.delete",
      data: {
        repoId: repoId.toString() // Convert BigInt/Number to string for JSON
      }
    });

    // 3. Delete from Database
    await prisma.repository.delete({ where: { id: repo.id } });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error("Disconnect Error:", error);
    return { error: 'Failed to disconnect' };
  }
}

export async function disconnectAllRepositoriesAction() {
  const session = await requireAuth();
  const token = await getGithubToken();

  const repos = await prisma.repository.findMany({
    where: { userId: session.user.id },
  });

  if (repos.length === 0) return { success: true };

  // 1. Parallel Webhook Deletion (Keep your existing logic)
  await Promise.allSettled(
    repos.map((repo) => {
      if (repo.webhookId) {
        return deleteWebHook(
          token,
          repo.owner,
          repo.name,
          Number(repo.webhookId)
        );
      }
      return Promise.resolve();
    })
  );

  // 2. Batch Trigger Inngest (OPTIMIZED)
  // Instead of calling inngest.send() 50 times, we send 1 array.
  // This is extremely efficient.
  if (repos.length > 0) {
    await inngest.send(
      repos.map(repo => ({
        name: "repo.delete",
        data: {
          repoId: repo.githubId.toString()
        }
      }))
    );
  }

  // 3. Batch Delete from DB
  await prisma.repository.deleteMany({
    where: { userId: session.user.id },
  });

  revalidatePath('/dashboard');
  return { success: true };
}
