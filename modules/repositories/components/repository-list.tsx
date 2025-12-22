'use client';

import { useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'; // Import useMutation
import { useDebounce } from 'use-debounce';
import {
  getRepositoriesAction,
  disconnectAllRepositoriesAction,
} from '../action'; // Import new action
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox'; // Shadcn Checkbox
import { Label } from '@/components/ui/label';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { RepositoryItem } from './repository-item';
import { toast } from 'sonner';
import { RepoListNode, RepoPage } from '@/modules/github/lib/types';

// ... imports

export default function RepositoryList({
  initialData,
}: {
  initialData: RepoPage;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 500);

  // 1. New State for the Filter
  const [showConnectedOnly, setShowConnectedOnly] = useState(false);

  // 2. Updated Query Hook
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      // Include the filter in the Query Key!
      queryKey: ['repos-list', debouncedSearch, showConnectedOnly],

      // Pass the filter to the Server Action
      queryFn: ({ pageParam }) =>
        getRepositoriesAction(pageParam, debouncedSearch, showConnectedOnly),

      initialPageParam: null as string | null,

      initialData:
        debouncedSearch || showConnectedOnly
          ? undefined
          : {
              pages: [initialData],
              pageParams: [null],
            },

      getNextPageParam: (lastPage) =>
        lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : null,
    });

  // 3. Disconnect All Mutation
  const disconnectAllMutation = useMutation({
    mutationFn: async () => await disconnectAllRepositoriesAction(),
    onMutate: () => {
      toast.info('Disconnecting all repositories...');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos-list'] });
      toast.success('All repositories disconnected');
    },
    onError: () => {
      toast.error('Failed to disconnect repositories');
    },
  });

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* Filter Checkbox */}
          <div className="flex items-center space-x-2 border p-2 rounded-md bg-background">
            <Checkbox
              id="connected-filter"
              checked={showConnectedOnly}
              onCheckedChange={(checked) =>
                setShowConnectedOnly(checked as boolean)
              }
            />
            <Label
              htmlFor="connected-filter"
              className="text-sm font-medium cursor-pointer"
            >
              Show Connected
            </Label>
          </div>

          {/* Disconnect All Button (Only show if we have connected repos ideally, or always) */}
          <Button
            variant="destructive"
            size="icon"
            title="Disconnect All"
            onClick={() => {
              if (
                confirm(
                  'Are you sure you want to disconnect ALL repositories? This cannot be undone.'
                )
              ) {
                disconnectAllMutation.mutate();
              }
            }}
            disabled={disconnectAllMutation.isPending}
          >
            {disconnectAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center p-4 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      )}

      {/* List */}
      <div className="grid grid-cols-1 gap-3">
        {data?.pages.map((page: RepoPage) =>
          page.nodes.map((repo: RepoListNode) => (
            <RepositoryItem key={repo.id} repo={repo} />
          ))
        )}

        {data?.pages[0].nodes.length === 0 && !isLoading && (
          <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
            {showConnectedOnly
              ? 'No connected repositories found.'
              : 'No repositories found matching your search.'}
          </div>
        )}
      </div>

      {/* Load More (Only show if NOT in connected-only mode, as DB list is usually single page) */}
      {hasNextPage && !showConnectedOnly && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </Button>
      )}
    </div>
  );
}
