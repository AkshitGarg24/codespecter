import { pineconeIndex } from "@/lib/pinecone";
import { embed } from "ai";
import { google } from "@ai-sdk/google";
import { chunkCode } from "./parser";

export async function generateEmbeddings(text: string) {
    const { embedding } = await embed({
        model: google.textEmbeddingModel("text-embedding-004"),
        value: text,
    })
    return embedding
}

export async function indexCodebase(repoId: string, files: { path: string, content: string }[]) {
    const vectors = [];

    console.log(`🧠 Parsing ${files.length} files...`);

    for (const file of files) {
        try {
            // ✅ STEP 1: Smart Chunking
            const chunks = await chunkCode(file.content, file.path);

            for (const chunk of chunks) {
                // ✅ STEP 2: Contextual Embedding
                // We prepend metadata so the AI knows WHAT this code is
                const embeddingContent = `File: ${file.path}\nType: ${chunk.metadata.type}\nLines: ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd}\n\n${chunk.content}`;

                const embedding = await generateEmbeddings(embeddingContent);

                // ⚠️ SAFETY CHECK: Pinecone limit is 40KB.
                // We assume 1 char ~= 1 byte (roughly). Let's cap at 30KB to be safe.
                const MAX_METADATA_SIZE = 30000;
                let safeContent = chunk.content;

                if (Buffer.byteLength(safeContent, 'utf8') > MAX_METADATA_SIZE) {
                    console.warn(`⚠️ Truncating chunk in ${file.path} (Lines ${chunk.metadata.lineStart}-${chunk.metadata.lineEnd}) to fit metadata limit.`);
                    // Slice it to ~30k chars
                    safeContent = safeContent.slice(0, MAX_METADATA_SIZE) + "...[TRUNCATED]";
                }

                vectors.push({
                    id: `${repoId}-${file.path.replace(/[^a-zA-Z0-9-_]/g, '_')}-${chunk.metadata.lineStart}`,
                    values: embedding,
                    metadata: {
                        repoId,
                        path: file.path,
                        content: safeContent, // Use the safe version
                        lineStart: chunk.metadata.lineStart,
                        lineEnd: chunk.metadata.lineEnd,
                        type: chunk.metadata.type
                    }
                });
            }
        } catch (error) {
            console.error(`Failed to parse/embed file: ${file.path}`, error);
        }
    }

    // ✅ STEP 3: Batch Upsert (Max 100 at a time)
    if (vectors.length > 0) {
        const batchSize = 50; // Safer batch size for Pinecone
        console.log(`🚀 Upserting ${vectors.length} vectors...`);

        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            // Use Namespace for data isolation
            await pineconeIndex.namespace(repoId).upsert(batch);
        }
    }
}


export async function retrieveContext(query: string, repoId: string) {
    const embedding = await generateEmbeddings(query);

    // Query the specific namespace
    const results = await pineconeIndex.namespace(repoId).query({
        topK: 5,
        vector: embedding,
        includeMetadata: true,
    });

    return results.matches.map(match => match.metadata?.content as string).filter(Boolean);
}