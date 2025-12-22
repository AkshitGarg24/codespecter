// app/api/webhooks/github/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { inngest } from '@/inngest/client';

export async function POST(req: Request) {
  try {
    // 1. Read Raw Body (Required for HMAC)
    const body = await req.text();

    // 2. Get Headers
    const headerList = await headers();
    const signature = headerList.get('x-hub-signature-256');
    const eventType = headerList.get('x-github-event');

    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      console.error('WEBHOOK_SECRET is missing in .env');
      return NextResponse.json(
        { error: 'Server Configuration Error' },
        { status: 500 }
      );
    }

    // 3. Security: Handle missing signature
    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 401 }
      );
    }

    // 4. Verify Signature
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
      console.error('Invalid Webhook Signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // 5. Logic
    const payload = JSON.parse(body);
    console.log(`Webhook verified. Event: ${eventType}`);

    if (eventType === 'pull_request') {
      const { action, pull_request, repository } = payload;

      // We also check "opened" and "synchronize" (updates to PR)
      if (action === 'opened' || action === 'synchronize') {
        console.log(
          `Triggering AI for PR #${pull_request.number} in ${repository.full_name}`
        );

        await inngest.send({
          name: 'pr.review', // Must match the event name in review-pr.ts
          data: {
            repoId: repository.id, // Needed for DB lookup
            prNumber: pull_request.number,
            owner: repository.owner.login,
            repo: repository.name,
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
