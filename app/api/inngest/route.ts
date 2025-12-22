import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { reviewPr } from '@/inngest/functions/review-pr';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reviewPr],
});
