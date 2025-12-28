import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { reviewPr } from '@/inngest/functions/review-pr';
import { indexRepo } from '@/inngest/functions/index-repo';
import { deleteRepo } from '@/inngest/functions/delete-repo';
import { answerPrComment } from '@/inngest/functions/answer-comment';
import { indexChanges } from '@/inngest/functions/index-changes';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [reviewPr, indexRepo, deleteRepo, answerPrComment, indexChanges],
});
