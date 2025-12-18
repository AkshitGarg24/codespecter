import GitHubStats from '@/modules/dashboard/components/github-stats';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import {
  getCachedGithubStats,
  getGithubToken,
} from '@/modules/github/lib/github';

const MainPage = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  const token = await getGithubToken();

  if (!session?.user) return <div>Please log in</div>;
  const stats = await getCachedGithubStats(session.user.id, token);

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Overview of your coding activity and AI reviews
          </p>
        </div>
      </div>

      <GitHubStats initialData={stats} />
    </div>
  );
};

export default MainPage;
