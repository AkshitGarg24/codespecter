import { Octokit } from 'octokit';
import { parse } from 'yaml';
import { CodeSpecterConfig } from '@/types/config';

export async function fetchProjectConfig(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<CodeSpecterConfig | null> {
  const locations = ['.github/CODESPECTER.yml', 'CODESPECTER.yml'];

  for (const path of locations) {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });

      if ('content' in data && !Array.isArray(data)) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        const parsed = parse(content);
        console.log(`✅ Loaded config from ${path}`);
        return parsed as CodeSpecterConfig;
      }
    } catch (error: any) {
      // If 404, just try the next location
      if (error.status !== 404) {
        console.error(`Error fetching config at ${path}:`, error);
      }
    }
  }
  console.log('⚠️ No CODESPECTER.yml found. Using defaults.');
  return null;
}
