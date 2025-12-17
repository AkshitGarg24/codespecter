import { Octokit } from 'octokit';
import { auth } from '@/lib/auth';
import prisma from '@/lib/db';
import { headers } from 'next/headers';
import { GithubUserResponse } from './types';

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

export async function getAuthenticatedUser(token: string) {
  const octokit = new Octokit({ auth: token });

  const response = await octokit.graphql<{ viewer: { login: string } }>(
    `
      query { 
        viewer { 
          login 
        }  
      }
    `
  );

  return response.viewer.login;
}

export async function fetchGithubData(token: string, username: string) {
  const octokit = new Octokit({ auth: token });

  try {
    const response = await octokit.graphql<GithubUserResponse>(
      `
        query($username: String!) {
          user(login: $username) {
            name
            login
            avatarUrl
            followers { totalCount }
            following { totalCount }
            
            # Get top 100 repos to calculate total stars/forks
            repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: STARGAZERS, direction: DESC}) {
              totalCount
              nodes {
                name
                stargazerCount
                forkCount
                primaryLanguage {
                  name
                  color
                }
              }
            }
            
            # Get contribution counts and calendar
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
      `,
      { username }
    );

    return response.user;
  } catch (error) {
    console.error('Error fetching GitHub data:', error);
    return null;
  }
}

export function getDashboardStats(userData: GithubUserResponse['user']) {
  const repoStats = userData.repositories.nodes.reduce(
    (acc, repo) => ({
      stars: acc.stars + repo.starCount,
      forks: acc.forks + repo.forkCount,
    }),
    { stars: 0, forks: 0 }
  );

  return {
    username: userData.login,
    name: userData.name,
    avatar: userData.avatarUrl,
    followers: userData.followers.totalCount,
    following: userData.following.totalCount,
    totalRepos: userData.repositories.totalCount,
    totalStars: repoStats.stars,
    totalForks: repoStats.forks,
    totalCommits: userData.contributionsCollection.totalCommitContributions,
    totalPRs: userData.contributionsCollection.totalPullRequestContributions,
    totalIssues: userData.contributionsCollection.totalIssueContributions,
    totalContributions:
      userData.contributionsCollection.contributionCalendar.totalContributions,
  };
}

export function getMonthlyActivity(userData: GithubUserResponse['user']) {
  const calendar = userData.contributionsCollection.contributionCalendar;
  const monthlyStats: Record<string, number> = {};

  calendar.weeks.forEach((week) => {
    week.contributionDays.forEach((day) => {
      const dateObj = new Date(day.date);
      const monthKey = dateObj.toLocaleString('default', {
        month: 'short',
        year: 'numeric',
      });

      if (!monthlyStats[monthKey]) {
        monthlyStats[monthKey] = 0;
      }
      monthlyStats[monthKey] += day.contributionCount;
    });
  });

  return Object.entries(monthlyStats).map(([month, count]) => ({
    month,
    count,
  }));
}
