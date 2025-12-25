import { inngest } from "../client";
import { pineconeIndex } from "@/lib/pinecone";

export const deleteRepo = inngest.createFunction(
  { 
    id: "delete-repo",
    retries: 5 // Allow up to 5 automatic retries if Pinecone is slow
  },
  { event: "repo.delete" },
  async ({ event, step }) => {
    const repoId = event.data.repoId as string;

    // 1. Check current status
    let vectorCount = await step.run("check-initial-count", async () => {
        const initialStats = await pineconeIndex.describeIndexStats();
        return initialStats.namespaces?.[repoId]?.recordCount || 0;
    });

    if (vectorCount === 0) {
        return { success: true, message: `Namespace ${repoId} is already empty.` };
    }

    // 2. Send Delete Command
    await step.run("delete-namespace", async () => {
        console.log(`🗑️ Deleting ${vectorCount} vectors from ${repoId}...`);
        await pineconeIndex.namespace(repoId).deleteAll();
    });

    // 3. POLLING: Wait for confirmation (max 60 seconds)
    const maxRetries = 12; 
    
    for (let i = 0; i < maxRetries; i++) {
        // Use step.sleep to avoid serverless timeouts and billing for wait time
        await step.sleep(`wait-${i}`, "5s");

        vectorCount = await step.run(`check-count-${i}`, async () => {
            const currentStats = await pineconeIndex.describeIndexStats();
            return currentStats.namespaces?.[repoId]?.recordCount || 0;
        });

        if (vectorCount === 0) {
            console.log(`✅ Verified: Namespace ${repoId} is fully empty.`);
            return { success: true, repoId };
        }
    }

    // 4. Fail if still not empty
    throw new Error(`Deletion timed out. ${vectorCount} vectors still exist in ${repoId}.`);
  }
);