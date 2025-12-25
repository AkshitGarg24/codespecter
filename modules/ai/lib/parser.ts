import { Parser, Language, Query } from 'web-tree-sitter';
import path from 'path';
import fs from 'fs';

let isInitialized = false;

// Initialize once per server instance
async function initParser() {
  if (isInitialized) return;
  try {
    // 🔥 CRITICAL: Point to the 'web-tree-sitter.wasm' we copied to public/grammars
    await Parser.init({
      locateFile(scriptName: string, scriptDirectory: string) {
        return path.join(process.cwd(), 'public', 'grammars', 'web-tree-sitter.wasm');
      },
    });
    isInitialized = true;
  } catch (e) {
    console.error("❌ Failed to init parser. Check if 'public/grammars/web-tree-sitter.wasm' exists.", e);
    throw e;
  }
}

export interface CodeChunk {
  content: string;
  metadata: {
    lineStart: number;
    lineEnd: number;
    type: "function" | "class" | "method" | "block";
  };
}

export async function chunkCode(code: string, filename: string): Promise<CodeChunk[]> {
  try {
    await initParser();
  } catch (e) {
    // Fail safe: If parser crashes, return the whole file as one block
    return [{ content: code, metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } }];
  }

  const parser = new Parser();

  // 1. Detect Language
  // We added JS/JSX support here so you don't miss frontend logic
  let lang = '';
  if (filename.endsWith('.ts')) lang = 'typescript';
  else if (filename.endsWith('.tsx')) lang = 'tsx';
  else if (filename.endsWith('.js') || filename.endsWith('.jsx')) lang = 'javascript';
  else if (filename.endsWith('.py')) lang = 'python';
  else if (filename.endsWith('.go')) lang = 'go';
  else if (filename.endsWith('.java')) lang = 'java';

  // If unsupported language (e.g. CSS, JSON), return whole file
  if (!lang) {
      parser.delete();
      return [{ content: code, metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } }];
  }

  // 2. Load Grammar
  const wasmPath = path.join(process.cwd(), 'public', 'grammars', `tree-sitter-${lang}.wasm`);

  if (!fs.existsSync(wasmPath)) {
    console.warn(`⚠️ Grammar missing for ${lang}, skipping smart parse.`);
    parser.delete();
    return [{ 
        content: code, 
        metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } 
    }];
  }

  const language = await Language.load(wasmPath);
  parser.setLanguage(language);

  // 3. Parse
  const tree = parser.parse(code);
  
  // Safety check for null tree
  if (!tree) {
    console.error(`Failed to parse ${filename}`);
    parser.delete();
    return [{ content: code, metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } }];
  }

  const chunks: CodeChunk[] = [];

  // 4. Define Query
  // Note: 'const_func' captures "const foo = () => {}" in JS/TS
  const queryStr = `
    (function_declaration) @func
    (method_definition) @method
    (class_declaration) @class
    (lexical_declaration) @const_func
  `;

  let query: Query | undefined;
  
  try {
      // Some languages (like Python) might throw error on 'lexical_declaration'
      // We wrap creation in try-catch to be safe
      try {
        query = new Query(language, queryStr);
      } catch (e) {
        // Fallback query for Python or generic languages if the strict one fails
        query = new Query(language, `
            (function_definition) @func
            (class_definition) @class
        `);
      }

      const matches = query.matches(tree.rootNode);

      matches.forEach((match) => {
        const capture = match.captures[0];
        const node = capture.node;
        const captureName = capture.name;

        // --- COMMENT HOISTING LOGIC ---
        let currentNode = node;
        let commentText = "";
        let startRow = node.startPosition.row;

        // Look back 5 siblings for comments
        for (let i = 0; i < 5; i++) {
            const prev = currentNode.previousSibling;
            if (!prev) break;

            if (prev.type.includes("comment") || prev.type.includes("doc_string")) {
                commentText = prev.text + "\n" + commentText;
                startRow = prev.startPosition.row;
                currentNode = prev;
            } else if (prev.type.trim() === "") {
                currentNode = prev;
            } else {
                break;
            }
        }

        const fullText = commentText + node.text;
        
        // Filter tiny helpers (less than 4 lines)
        if (fullText.split('\n').length < 4) return;

        let type: CodeChunk['metadata']['type'] = 'block';
        if (captureName === 'func' || captureName === 'const_func') type = 'function';
        else if (captureName === 'method') type = 'method';
        else if (captureName === 'class') type = 'class';

        chunks.push({
            content: fullText,
            metadata: {
                lineStart: startRow + 1,
                lineEnd: node.endPosition.row + 1,
                type: type
            }
        });
      });
  } catch (e) {
      console.warn(`Query match failed for ${filename}, returning file block.`);
      // If query fails completely, just return the whole file
      if (chunks.length === 0) {
         chunks.push({ content: code, metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } });
      }
  } finally {
      if (query) query.delete();
  }

  // 5. Cleanup
  tree.delete();
  parser.delete();

  if (chunks.length === 0) {
      return [{ content: code, metadata: { lineStart: 1, lineEnd: code.split('\n').length, type: 'block' } }];
  }

  return chunks;
}