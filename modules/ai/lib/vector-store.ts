import { pineconeIndex } from '@/lib/pinecone';

export const vectorStore = {
  /**
   * Upsert vectors into a specific namespace (Repo ID)
   */
  upsert: async (vectors: any[], repoId: string) => {
    if (vectors.length === 0) return;

    const batchSize = 50; // Pinecone recommended batch size
    console.log(
      `🚀 Upserting ${vectors.length} vectors to namespace: ${repoId}...`
    );

    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await pineconeIndex.namespace(repoId).upsert(batch);
    }
  },

  /**
   * Delete vectors by file path (metadata filter)
   * This is crucial for "Clean Slate" updates
   */
  deleteFile: async (filePath: string, repoId: string) => {
    console.log(
      `🗑️ Deleting vectors for file: ${filePath} in namespace: ${repoId}`
    );
    try {
      await pineconeIndex.namespace(repoId).deleteMany({
        path: { $eq: filePath },
      });
    } catch (error) {
      console.error(`Failed to delete vectors for ${filePath}`, error);
    }
  },

  /**
   * Search for context
   */
  search: async (embedding: number[], repoId: string, limit = 5) => {
    const results = await pineconeIndex.namespace(repoId).query({
      topK: limit,
      vector: embedding,
      includeMetadata: true,
    });

    return results.matches
      .map((match) => match.metadata?.content as string)
      .filter(Boolean);
  },
};
