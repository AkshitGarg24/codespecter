// app/dashboard/actions.ts
"use server";

import { getGithubToken } from "../github/lib/github";
import { fetchUserRepos } from "../github/lib/github";

// 👇 Add 'query' as the second argument here
export async function getRepositoriesAction(cursor?: string | null, query?: string) {
  const token = await getGithubToken();
  return await fetchUserRepos(token, cursor, query);
}