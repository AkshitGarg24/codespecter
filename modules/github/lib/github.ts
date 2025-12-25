import { Octokit } from 'octokit';
import { unstable_cache } from 'next/cache';
import { GithubViewerResponse, DashboardStats, RepoPage } from './types';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export const getGithubToken = async () => {
  const { accessToken } = await auth.api.getAccessToken({
    body: {
      providerId: 'github',
    },
    headers: await headers(),
  });
  if (!accessToken) {
    throw new Error('Unauthorized');
  }
  return accessToken;
};

async function fetchRawViewerData(token: string) {
  const octokit = new Octokit({ auth: token });

  return octokit.graphql<GithubViewerResponse>(
    `
      query { 
        viewer { 
          login
          name
          avatarUrl
          followers { totalCount }
          following { totalCount }
          
          repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
            totalCount
            nodes {
              name
              stargazerCount
              forkCount
              primaryLanguage { name color }
            }
          }
          
          contributionsCollection {
            totalCommitContributions
            totalPullRequestContributions
            totalIssueContributions
            contributionCalendar {
              totalContributions
              weeks {
                contributionDays {
                  contributionCount
                  date
                  color
                }
              }
            }
          }
        } 
      }
    `
  );
}

function processGithubData(data: GithubViewerResponse): DashboardStats {
  const user = data.viewer;
  const repoStats = user.repositories.nodes.reduce(
    (acc, repo) => ({
      stars: acc.stars + repo.stargazerCount,
      forks: acc.forks + repo.forkCount,
    }),
    { stars: 0, forks: 0 }
  );

  const monthlyMap: Record<string, number> = {};
  user.contributionsCollection.contributionCalendar.weeks.forEach((week) => {
    week.contributionDays.forEach((day) => {
      const key = new Date(day.date).toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });
      monthlyMap[key] = (monthlyMap[key] || 0) + day.contributionCount;
    });
  });

  const monthlyActivity = Object.entries(monthlyMap).map(([month, count]) => ({
    month,
    count,
  }));

  return {
    username: user.login,
    name: user.name,
    avatar: user.avatarUrl,
    followers: user.followers.totalCount,
    following: user.following.totalCount,
    totalRepos: user.repositories.totalCount,
    totalStars: repoStats.stars,
    totalForks: repoStats.forks,
    totalCommits: user.contributionsCollection.totalCommitContributions,
    totalPRs: user.contributionsCollection.totalPullRequestContributions,
    totalIssues: user.contributionsCollection.totalIssueContributions,
    totalContributions:
      user.contributionsCollection.contributionCalendar.totalContributions,
    monthlyActivity,
  };
}

export async function getCachedGithubStats(userId: string, token: string) {
  const getCachedFn = unstable_cache(
    async () => {
      const rawData = await fetchRawViewerData(token);
      return processGithubData(rawData);
    },
    [`github-stats-${userId}`],
    {
      revalidate: 120,
      tags: [`user-stats-${userId}`],
    }
  );

  return getCachedFn();
}

export async function fetchUserRepos(
  token: string,
  cursor?: string | null,
  searchQuery?: string
): Promise<RepoPage> {
  const octokit = new Octokit({ auth: token });

  // CASE A: Search Mode
  if (searchQuery) {
    const searchResponse = await octokit.graphql<{ search: RepoPage }>(
      `
        query($searchQuery: String!, $cursor: String) {
          search(query: $searchQuery, type: REPOSITORY, first: 10, after: $cursor) {
            nodes {
              ... on Repository {
                id
                databaseId 
                name
                stargazerCount
                updatedAt
                url
                isPrivate
                primaryLanguage { name color }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      `,
      { searchQuery: `user:@me ${searchQuery} sort:updated-desc`, cursor }
    );
    return searchResponse.search;
  }

  // CASE B: List Mode
  const listResponse = await octokit.graphql<{
    viewer: { repositories: RepoPage };
  }>(
    `
      query($cursor: String) { 
        viewer { 
          repositories(
            first: 10, 
            ownerAffiliations: OWNER, 
            orderBy: {field: UPDATED_AT, direction: DESC},
            after: $cursor
          ) {
            nodes {
              id
              databaseId 
              name
              stargazerCount
              updatedAt
              url
              isPrivate
              primaryLanguage { name color }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        } 
      }
    `,
    { cursor }
  );

  return listResponse.viewer.repositories;
}

export async function getRepoFileStructure(token: string, owner: string, repo: string) {
  const octokit = new Octokit({ auth: token });

  const { data: repoData } = await octokit.rest.repos.get({
    owner,
    repo,
  });

  const defaultBranch = repoData.default_branch;

  // 1. Get the HEAD commit to find the tree SHA
  const { data: commit } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: defaultBranch,
  });

  // 2. Fetch the ENTIRE tree in 1 call (Recursive)
  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: commit.commit.tree.sha,
    recursive: "true"
  });

  // 3. Filter for valid code files only
  return tree.tree
    .filter(item =>
      item.type === "blob" &&
      item.path &&
      // Ensure we allow .ts, .js, .tsx, .py etc.
      !item.path.match(/\.(png|jpg|jpeg|gif|svg|ico|pdf|zip|lock|json|map)$/i) &&
      !item.path.includes("node_modules")
    )
    .map(item => item.path!);
}

// Helper to fetch content for a BATCH of files (e.g., 10 at a time)
export async function fetchFileContentBatch(token: string, owner: string, repo: string, paths: string[]) {
  const octokit = new Octokit({ auth: token });

  // We use Promise.all to fetch these in parallel
  const results = await Promise.all(
    paths.map(async (path) => {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
        if ('content' in data) {
          return {
            path,
            content: Buffer.from(data.content, "base64").toString('utf-8')
          };
        }
      } catch (e) {
        console.error(`Failed to fetch ${path}`, e);
      }
      return null;
    })
  );

  return results.filter(Boolean) as { path: string, content: string }[];
}
