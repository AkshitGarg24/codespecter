import fs from 'fs';
import https from 'https';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 1. Setup Paths
const outDir = path.join(process.cwd(), 'public', 'grammars');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log("📂 Preparing Tree-Sitter Grammars...");

// -----------------------------------------
// TASK A: Copy the Main Runtime (web-tree-sitter.wasm)
// -----------------------------------------
try {
    const packagePath = require.resolve('web-tree-sitter/package.json');
    const packageDir = path.dirname(packagePath);
    
    // 🔥 FIX: Your screenshot shows the file is named 'web-tree-sitter.wasm'
    const sourceWasm = path.join(packageDir, 'web-tree-sitter.wasm');
    const destWasm = path.join(outDir, 'web-tree-sitter.wasm');

    if (fs.existsSync(sourceWasm)) {
        fs.copyFileSync(sourceWasm, destWasm);
        console.log(`✅ Core Runtime copied from: ${sourceWasm}`);
    } else {
        console.error(`❌ ERROR: Found package but 'web-tree-sitter.wasm' is missing at ${sourceWasm}`);
        process.exit(1);
    }
} catch (e) {
    console.error("❌ ERROR: Could not resolve 'web-tree-sitter'. Run 'bun add web-tree-sitter'");
    console.error(e);
    process.exit(1);
}

// -----------------------------------------
// TASK B: Download Language Grammars
// -----------------------------------------
const languages = [
    { name: 'typescript', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@latest/tree-sitter-typescript.wasm' },
    { name: 'tsx', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-typescript@latest/tree-sitter-tsx.wasm' },
    { name: 'javascript', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-javascript@latest/tree-sitter-javascript.wasm' },
    { name: 'python', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-python@latest/tree-sitter-python.wasm' },
    { name: 'go', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-go@latest/tree-sitter-go.wasm' },
    { name: 'java', url: 'https://cdn.jsdelivr.net/npm/tree-sitter-java@latest/tree-sitter-java.wasm' },
];

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                if(response.statusCode === 302 && response.headers.location) {
                    downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                    return;
                }
                reject(new Error(`Status ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded: ${path.basename(dest)}`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

(async () => {
    for (const lang of languages) {
        const dest = path.join(outDir, `tree-sitter-${lang.name}.wasm`);
        try {
            await downloadFile(lang.url, dest);
        } catch (e) {
            console.error(`❌ Error downloading ${lang.name}:`, e.message);
        }
    }
})();