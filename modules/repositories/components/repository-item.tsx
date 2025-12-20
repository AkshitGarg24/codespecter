import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, GitFork, ExternalLink } from "lucide-react";
import { RepoListNode } from "@/modules/github/lib/types";

interface RepositoryItemProps {
    repo: RepoListNode;
    onConnect: (repoId: any) => void;
}

export function RepositoryItem({ repo, onConnect }: RepositoryItemProps) {
    return (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-muted/30 transition-all py-5 px-5">
            <div className="space-y-1">
                {/* Title and Link */}
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-lg">{repo.name}</span>
                    <a
                        href={repo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                    >
                        <ExternalLink className="h-3 w-3" />
                    </a>
                    <Badge variant="outline" className="h-5 px-1.5 font-normal">
                        {repo.isPrivate ? "Private" : "Public"}
                    </Badge>
                </div>

                {/* Metadata Row */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {/* Primary Language */}
                    {repo.primaryLanguage && (
                        <div className="flex items-center gap-1.5">
                            <span
                                className="block h-2 w-2 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: repo.primaryLanguage.color }}
                            />
                            {repo.primaryLanguage.name}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
                {/* Stats (Hidden on small screens) */}
                <div className="hidden sm:flex items-center gap-3 text-sm text-muted-foreground">
                    {repo.stargazerCount > 0 && (
                        <div className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5" />
                            <span>{repo.stargazerCount}</span>
                        </div>
                    )}
                </div>

                <Button size="sm" className="cursor-pointer" onClick={() => onConnect(repo.id)}>
                    Connect
                </Button>
            </div>
        </div>
    );
}