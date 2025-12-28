import { Octokit } from 'octokit';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export async function createWebHook(
  token: string,
  owner: string,
  repo: string
) {
  const octokit = new Octokit({ auth: token });
  const webHookURL = `${APP_URL}/api/webhooks/github`;

  try {
    const response = await octokit.request('POST /repos/{owner}/{repo}/hooks', {
      owner,
      repo,
      name: 'web',
      active: true,
      events: [
        'pull_request',
        'push',
        'pull_request_review', // Triggers when a Review is submitted (Approve/Reject)
        'pull_request_review_comment', // Triggers on code-specific comments
        'issue_comment',
      ],
      config: {
        url: webHookURL,
        content_type: 'json',
        secret: process.env.WEBHOOK_SECRET,
      },
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
    return response.data.id;
  } catch (error: any) {
    if (error.status === 422) {
      console.log('Webhook already exists.');
      return null;
    }
    throw error;
  }
}

export async function deleteWebHook(
  token: string,
  owner: string,
  repo: string,
  hookId: number
) {
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.request('DELETE /repos/{owner}/{repo}/hooks/{hook_id}', {
      owner,
      repo,
      hook_id: hookId,
      headers: { 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch (error) {
    console.error('Error deleting webhook:', error);
  }
}
