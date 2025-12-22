export function parseGithubUrl(url: string) {
  try {
    const cleanUrl = url.replace(/\/$/, '').replace(/\.git$/, '');
    const parsed = new URL(cleanUrl);
    if (parsed.hostname !== 'github.com') {
      throw new Error('Not a GitHub URL');
    }
    const parts = parsed.pathname.split('/');

    if (parts.length < 3) {
      throw new Error('Invalid GitHub repository URL');
    }

    return {
      owner: parts[1],
      repo: parts[2],
    };
  } catch {
    return null;
  }
}
