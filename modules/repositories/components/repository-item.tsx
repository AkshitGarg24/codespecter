import { InfiniteData, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Lock, Globe, ExternalLink } from 'lucide-react';
import { RepoListNode, RepoPage } from '@/modules/github/lib/types';
import { useMutation } from '@tanstack/react-query';
import { connectRepositoryAction, disconnectRepositoryAction } from '../action';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function RepositoryItem({ repo }: { repo: RepoListNode }) {
  const queryClient = useQueryClient();

  const updateCacheState = (isConnected: boolean) => {
    queryClient.setQueriesData(
      { queryKey: ['repos-list'] },
      (oldData: InfiniteData<RepoPage>) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          pages: oldData.pages.map((page: RepoPage) => ({
            ...page,
            nodes: page.nodes.map((node: RepoListNode) =>
              node.id === repo.id ? { ...node, isConnected } : node
            ),
          })),
        };
      }
    );
  };

  // 1. Connect Mutation
  const connectMutation = useMutation({
    mutationFn: async () => await connectRepositoryAction(repo),
    onMutate: async () => {
      updateCacheState(true);
    },
    onError: () => {
      updateCacheState(false);
      toast.error('Failed to connect repository');
    },
    onSuccess: () => {
      toast.success(`${repo.name} connected`);
    },
  });

  // 2. Disconnect Mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => await disconnectRepositoryAction(repo.databaseId),
    onMutate: async () => {
      updateCacheState(false);
    },
    onError: () => {
      updateCacheState(true);
      toast.error('Failed to disconnect');
    },
    onSuccess: () => {
      toast.success(`${repo.name} disconnected`);
    },
  });

  const isLoading = connectMutation.isPending || disconnectMutation.isPending;
  const isConnected = repo.isConnected;

  // Format the date (e.g., "Dec 20, 2024")
  const formattedDate = new Date(repo.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex items-center justify-between p-4 border rounded-xl bg-card hover:bg-muted/30 transition-all group">
      <div className="flex items-start gap-4 overflow-hidden">
        {/* Icon Box */}
        <div
          className={cn(
            'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
            repo.isPrivate
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-500'
              : 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-500'
          )}
        >
          {repo.isPrivate ? (
            <Lock className="w-5 h-5" />
          ) : (
            <Globe className="w-5 h-5" />
          )}
        </div>

        <div className="space-y-1.5 min-w-0">
          {/* Title Row */}
          <div className="flex items-center gap-2">
            <a
              href={repo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-base truncate hover:underline underline-offset-4 decoration-primary/50 flex items-center gap-1"
            >
              {repo.name}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
            </a>
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground"
            >
              {repo.isPrivate ? 'Private' : 'Public'}
            </Badge>
          </div>

          {/* Metadata Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {/* Primary Language */}
            {repo.primaryLanguage && (
              <div className="flex items-center gap-1.5">
                <span
                  className="block h-2 w-2 rounded-full ring-1 ring-black/5 dark:ring-white/10"
                  style={{ backgroundColor: repo.primaryLanguage.color }}
                />
                {repo.primaryLanguage.name}
              </div>
            )}

            {/* Stars */}
            {repo.stargazerCount > 0 && (
              <div className="flex items-center gap-1">
                <Star className="h-3 w-3 mb-0.5 text-amber-500 fill-amber-500" />
                <span>{repo.stargazerCount}</span>
              </div>
            )}

            {/* Updated At */}
            <div className="text-muted-foreground/60">
              Updated {formattedDate}
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="pl-4">
        {isConnected ? (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-medium text-green-600 dark:text-green-500 uppercase tracking-wider">
              Active
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900/30 dark:text-red-400 dark:hover:bg-red-900/20"
              onClick={() => disconnectMutation.mutate()}
              disabled={isLoading}
            >
              {isLoading ? '...' : 'Disconnect'}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            className="h-8"
            onClick={() => connectMutation.mutate()}
            disabled={isLoading}
          >
            {isLoading ? 'Disconnecting...' : 'Connect'}
          </Button>
        )}
      </div>
    </div>
  );
}
