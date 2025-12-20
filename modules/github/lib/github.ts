import { Octokit } from 'octokit';
import { unstable_cache } from 'next/cache';
import { GithubViewerResponse, DashboardStats, RepoListResponse } from './types';
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


export async function fetchUserRepos(token: string, cursor?: string | null, searchQuery?: string) {
  const octokit = new Octokit({ auth: token });

  // CASE A: Search Mode
  if (searchQuery) {
    const searchResponse = await octokit.graphql<{ search: any }>(
      `
        # 1. RENAME VARIABLE: $query -> $searchQuery
        query($searchQuery: String!, $cursor: String) {
          # 2. USE NEW NAME: query: $searchQuery
          search(query: $searchQuery, type: REPOSITORY, first: 10, after: $cursor) {
            nodes {
              ... on Repository {
                id
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
      { 
        // 3. PASS NEW VARIABLE NAME
        searchQuery: `user:@me ${searchQuery} sort:updated-desc`,
        cursor 
      }
    );
    return searchResponse.search;
  }

  // CASE B: List Mode (No changes needed here)
  const listResponse = await octokit.graphql<{ viewer: { repositories: any } }>(
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