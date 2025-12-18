export interface ContributionDay {
  contributionCount: number;
  date: string;
  color: string;
}

export interface ContributionWeek {
  contributionDays: ContributionDay[];
}

export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

export interface RepoNode {
  name: string;
  stargazerCount: number;
  forkCount: number;
  primaryLanguage: {
    name: string;
    color: string;
  } | null;
}

export interface ContributionsCollection {
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  contributionCalendar: ContributionCalendar;
}

export interface GithubUser {
  name: string;
  login: string;
  avatarUrl: string;
  followers: {
    totalCount: number;
  };
  following: {
    totalCount: number;
  };
  repositories: {
    totalCount: number;
    nodes: RepoNode[];
  };
  contributionsCollection: ContributionsCollection;
}

export interface GithubViewerResponse {
  viewer: GithubUser;
}

export interface MonthlyActivityItem {
  month: string;
  count: number;
}

export interface DashboardStats {
  username: string;
  name: string;
  avatar: string;
  followers: number;
  following: number;
  totalRepos: number;
  totalStars: number;
  totalForks: number;
  totalCommits: number;
  totalPRs: number;
  totalIssues: number;
  totalContributions: number;
  monthlyActivity: MonthlyActivityItem[];
}
