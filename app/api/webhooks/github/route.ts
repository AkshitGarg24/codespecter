import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';

export async function POST(req: Request) {
  try {
    // 1. Read Raw Body
    const body = await req.text();

    // 2. Get Headers
    const headerList = await headers();
    const signature = headerList.get('x-hub-signature-256');
    const eventType = headerList.get('x-github-event');

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret)
      return NextResponse.json(
        { error: 'Server Config Error' },
        { status: 500 }
      );
    if (!signature)
      return NextResponse.json({ error: 'No signature' }, { status: 401 });

    // 3. Verify Signature
    const hmac = crypto.createHmac('sha256', secret);
    const digest = Buffer.from(
      'sha256=' + hmac.update(body).digest('hex'),
      'utf8'
    );
    const checksum = Buffer.from(signature, 'utf8');

    if (
      digest.length !== checksum.length ||
      !crypto.timingSafeEqual(digest, checksum)
    ) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 4. Parse Payload
    const payload = JSON.parse(body);
    console.log(`🪝 Webhook received: ${eventType}`);

    if (
      payload.sender.type === 'Bot' ||
      payload.sender.login === 'your-bot-name'
    ) {
      return; // Stop processing to prevent loops
    }

    // -------------------------------------------------------
    // HANDLER 1: New PRs / Updates
    // -------------------------------------------------------
    if (eventType === 'pull_request') {
      const { action, pull_request, repository } = payload;

      if (action === 'opened' || action === 'synchronize') {
        console.log(`🚀 PR Event: #${pull_request.number} ${action}`);

        await inngest.send({
          name: 'pr.review',
          data: {
            repoId: repository.id,
            prNumber: pull_request.number,
            owner: repository.owner.login,
            repo: repository.name,
            title: pull_request.title,
            description: pull_request.body || '',
          },
        });
      }
    }

    // -------------------------------------------------------
    // HANDLER 2: Comments (Chat)
    // -------------------------------------------------------
    else if (
      eventType === 'issue_comment' ||
      eventType === 'pull_request_review_comment'
    ) {
      const { action, comment, repository } = payload;

      // ✅ Filter 1: Only care about new comments
      if (action === 'created') {
        // ✅ Filter 2: Check for @codespecter mention early (Optional, saves Inngest calls)
        // You can remove this if you want Inngest to handle the filtering
        const isMentioned = comment.body.toLowerCase().includes('@codespecter');
        if (!isMentioned) {
          console.log('Ignored comment: Bot not mentioned.');
          return NextResponse.json({ message: 'Ignored' });
        }

        // ✅ Filter 3: Determine PR Number & Verify it's a PR
        let prNumber: number | null = null;

        if (eventType === 'issue_comment') {
          // "issue_comment" fires for Issues AND PRs.
          // If 'pull_request' key is missing in 'issue', it's a regular Issue. Ignore it.
          if (!payload.issue.pull_request) {
            console.log('Ignored: Comment is on a regular Issue, not a PR.');
            return NextResponse.json({ message: 'Ignored issue comment' });
          }
          prNumber = payload.issue.number;
        } else {
          // "pull_request_review_comment" is ALWAYS on a PR.
          prNumber = payload.pull_request.number;
        }

        console.log(
          `💬 Comment Event on PR #${prNumber}: "${comment.body.substring(0, 20)}..."`
        );

        await inngest.send({
          name: 'pr.comment',
          data: {
            owner: repository.owner.login,
            repo: repository.name,
            commentId: comment.id,
            body: comment.body,
            prNumber: prNumber!, // Safe because of logic above
            repoId: repository.id,
            isBot: comment.user.type === 'Bot',
          },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook Error:', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
