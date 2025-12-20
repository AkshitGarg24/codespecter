"use client";

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce"; // 📦 Run: npm install use-debounce
import { getRepositoriesAction } from "../action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import { RepositoryItem } from "./repository-item";

export default function RepositoryList({ initialData }: { initialData: any }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500); // Wait 500ms after typing

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    // 1. Include search in the key! 
    // When 'debouncedSearch' changes, TanStack Query automatically refetches.
    queryKey: ["repos-list", debouncedSearch],
    
    queryFn: ({ pageParam }) => getRepositoriesAction(pageParam, debouncedSearch),
    
    initialPageParam: null as string | null,
    
    // Only use initialData if we are NOT searching (Page 1 default view)
    initialData: debouncedSearch ? undefined : {
      pages: [initialData],
      pageParams: [null],
    },
    
    getNextPageParam: (lastPage) => 
      lastPage.pageInfo.hasNextPage ? lastPage.pageInfo.endCursor : null,
  });

  const handleConnect = (repoId: string) => {
    console.log("Connecting repo:", repoId);
    // Add your mutation here
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading State for Search */}
      {isLoading && debouncedSearch && (
        <div className="text-center p-4 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
        </div>
      )}

      {/* The List */}
      <div className="grid grid-cols-1 gap-3">
        {data?.pages.map((page) =>
          page.nodes.map((repo: any) => (
            <RepositoryItem 
              key={repo.id} 
              repo={repo} 
              onConnect={handleConnect} 
            />
          ))
        )}
        
        {/* Empty State */}
        {data?.pages[0].nodes.length === 0 && (
           <div className="text-center p-8 border border-dashed rounded-lg text-muted-foreground">
             No repositories found.
           </div>
        )}
      </div>

      {/* Load More Button */}
      {hasNextPage && (
        <Button 
          variant="outline" 
          className="w-full cursor-pointer"
          onClick={() => fetchNextPage()} 
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</>
          ) : (
            "Load More"
          )}
        </Button>
      )}
    </div>
  );
}