'use client';

import {
  Bot,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { DashboardStats } from '@/modules/github/lib/types';
import { refreshStatsAction } from '../action';
import { ActivityGraph } from './activity-graph';

const GitHubStats = ({ initialData }: { initialData: DashboardStats }) => {
  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['github-stats'],
    initialData,
    queryFn: async () => await refreshStatsAction(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });
  const stats = [
    {
      title: 'Total Repositories',
      value: data.totalRepos,
      description: 'Connected Repositories',
      icon: GitBranch,
    },
    {
      title: 'Total Commits',
      value: data.totalCommits,
      description: 'In the last year',
      icon: GitCommitHorizontal,
    },
    {
      title: 'Pull Requests',
      value: data.totalPRs,
      description: 'in the last year',
      icon: GitPullRequest,
    },
    {
      title: 'AI Reviews',
      value: '12',
      description: 'Generated this week',
      icon: Bot,
    },
  ];

  return (
    <>
      <div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, index) => (
            <Card key={index} className="hover:bg-muted/50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-bold">
                  {stat.title}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isRefetching ? `Loading...` : `${stat.value}`}
                </div>
                <p className="text-xs text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <ActivityGraph data={initialData.monthlyActivity} />
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Reviews</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center">
                <Bot className="mr-2 h-4 w-4 text-blue-500" />
                <div className="ml-4 space-y-1">
                  <p className="text-sm font-medium leading-none">
                    fix: auth-middleware
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Suggested optimization
                  </p>
                </div>
                <div className="ml-auto font-medium text-xs text-green-500">
                  +2% perf
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default GitHubStats;
