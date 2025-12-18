'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { getGithubToken } from '../github/lib/github';
import { getCachedGithubStats } from '../github/lib/github';

export async function refreshStatsAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error('Unauthorized');

  const token = await getGithubToken();

  return await getCachedGithubStats(session.user.id, token);
}
