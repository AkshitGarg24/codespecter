# CodeSpecter: AI-Powered Automated Pull Request Reviewer

[![Tech Stack: Next.js, Inngest, Vercel AI SDK](https://img.shields.io/badge/Stack-Next.js_|_Inngest_|_Prisma_|_Gemini_AI-blue)](https://nextjs.org)

**CodeSpecter** is an intelligent automation bot that provides instant, contextual feedback on GitHub Pull Requests. It leverages Google's **Gemini 2.5 Flash**, Retrieval-Augmented Generation (**RAG**) for codebase context, and your project's own guidelines to ensure every PR meets high-quality standards.

Built with **Next.js** and **Inngest** for reliable, multi-step background processing.

---

## ✨ Features

* **Instant Automated Reviews:** Triggers the moment a PR is opened or new code is pushed.
* **Context-Aware (RAG):** Uses a Vector Database to "remember" your codebase, ensuring the AI understands how your specific system works.
* **Guideline Enforcement:** Reads your specific `guidelines/` folder to ensure code follows your team's unique rules.
* **Durable Execution:** Built with Inngest to handle API rate limits and retries automatically.
* **Smart Filtering:** Intelligent diff analysis that ignores lock files, assets, and minified code to focus on logic.

---

## 🏗 Repository Connection & Indexing Flow
This flow illustrates how CodeSpecter processes a repository from the initial click to a fully indexed RAG (Retrieval-Augmented Generation) state.
```mermaid
graph TD
    subgraph "Frontend"
        A[User Clicks 'Connect <br/>Repository'] --> C[Call API: <br/>/api/repositories/connect]
    end

    subgraph "Backend Orchestration (Inngest)"
        C --> D[Inngest Event: <br/>'repository.indexing']
        D --> E(Function: index-repo.ts)
    end

    subgraph "Indexing Pipeline"
        E --> F[Step 1: Clone/Fetch Code]
        F --> G[Step 2: File Discovery]
        G -->|Filter: .js, .ts, .py, .go, etc.| H[Step 3: Structural Parsing]
        
        subgraph "Tree-Sitter Processing"
            H --> I[Tree-Sitter Parser]
            I --> J[Extract Symbols: <br/>Classes, Functions, Methods]
            J --> K[Generate Code <br/>Snippets/Chunks]
        end

        K --> L[Step 4: Embedding<br/> Generation]
        L --> M{{Google Gemini/<br/>Text-Embedding API}}
        M -- Vector Vectors --> N[(Vector DB - Pinecone)]
    end

    subgraph "Finalization"
        N --> O[Step 5: Create Webhook]
        O --> P["Octokit: POST <br/>/repos/{owner}/{repo}/hooks"]
    end

    style I fill:#f39c12,color:#fff
    style J fill:#f39c12,color:#fff
    style N fill:#00bb7a,color:#fff
    style M fill:#4285F4,color:#fff
```

---

## 🔄 Architecture Flow

This diagram illustrates how a GitHub event travels through the system to generate an AI review.

```mermaid
graph TD
    subgraph "Developer Action"
        A[Developer Opens/<br/>Updates PR] --> B(GitHub Webhook <br/>'pull_request')
    end

    subgraph "Next.js App Server"
        B --> C{Webhook Handler}
        C -- Valid Signature --> D[Inngest Client: send event <br/>'pr.review']
        D --> E[Inngest Event Store]
    end

    subgraph "Inngest Function <br/>(review-pr.ts)"
        E --> F(Start 'review-pr' Function)
        
        %% Step 1
        F --> G(Step 1: Fetch Token)
        G --> H[(Prisma DB: Find Account)]
        H -- Access Token --> G
        
        %% Step 2
        G --> I(Step 2: Fetch Diff)
        I --> J[Octokit: GET /pulls/files]
        J -- Raw Diff Data --> I
        I -- Filtered Diffs --> K
        
        %% Step 3
        K(Step 3: Fetch Guidelines) --> L[Octokit: GET /contents]
        L -- Project Markdown Files --> K
        
        %% Step 4
        K --> M(Step 4: RAG Context)
        M -- Generate Query from Diffs --> N[(Vector Database)]
        N -- Relevant Snippets --> M
        
        %% Step 5
        M --> O(Step 5: AI Analysis)
        O -- Prompt + RAG + Diffs --> P{{Google Gemini 2.5 Flash}}
        P -- AI Review Text --> O
        
        %% Step 6
        O --> Q(Step 6: Post Result)
        Q --> R[Octokit: POST /issues/comments]
    end

    subgraph "GitHub UI"
        R --> S(Bot Comment on PR)
    end

    style F fill:#993a62,stroke:#333,stroke-width:2px
    style P fill:#1b4285,color:#fff
    style N fill:#17822b,color:#fff
```
---

## 💬 Interactive Comment Flow
CodeSpecter can respond interactively when explicitly mentioned in a PR comment
(e.g. @codespecter-ai-review handle this).

```mermaid
graph TD
    subgraph "GitHub Platform"
        A["User Comments<br/>on PR"]
        B["Webhook event:<br/>'issue_comment'<br/>OR<br/>'pull_request_review_comment'"]
        L["Bot Reply<br/>appears in Thread"]

        A -->|Body contains:<br/>'@codespecter-ai-review'| B
    end

    subgraph "Next.js Webhook Handler"
        C["API Route:<br/>/api/webhooks/github"]
        D["Inngest Client:<br/>send event<br/>'pr.comment.reply'"]
        X["Ignore Event"]

        B --> C
        C -- "1. Verify Signature<br/>2. Check for Mention" --> D
        C -- "No mention found" --> X
    end

    subgraph "Inngest Async Workflow"
        E["Inngest Queue"]
        F["Start Function:<br/>reply-to-comment.ts"]

        G["Step 1:<br/>Gather Thread Context"]
        H["Octokit API"]

        R1["Step 2:<br/>RAG Retrieval"]
        R2[("Vector Database")]

        I["Step 3:<br/>AI Processing"]
        J["Google Gemini<br/>2.5 Flash"]

        K["Step 4:<br/>Post Reply"]
        M["Octokit API"]

        D --> E --> F
        F --> G
        G -- "Fetch Thread History &<br/> PR Diffs" --> H
        H --> R1
        R1 -- "Query Codebase Knowledge" --> R2
        R2 -- "Contextual Code Snippets" --> R1
        R1 --> I
        I -- "Conversation + Diffs + <br/>RAG Context" --> J
        J -- "Generated Insightful Reply" --> I
        I --> K --> M
    end

    M --> L

    style A fill:#993a62,stroke:#333,stroke-width:2px
    style J fill:#1b4285,color:#fff
    style B fill:#823417,stroke:#333
    style L fill:#17822b,stroke:#fff,stroke-width:2px
    style R2 fill:#116e96,color:#fff
```

---

## ⚙️ Configuration

CodeSpecter is fully customizable. You can control the AI's behavior, tone, and strictness by adding a configuration file to your repository.
### File Location
Create a file named `CODESPECTER.yml` in one of the following locations:
- Root Directory: `./CODESPECTER.yml`
- GitHub Folder: `./.github/CODESPECTER.yml`

### Configuration Schema
The configuration follows this structure:

```typescript
export interface CodeSpecterConfig {
  review?: {
    enabled?: boolean;
    tone?: 'professional' | 'friendly' | 'critical' | 'instructional';
    rules?: string[];   // Strict rules the AI must enforce
    ignore?: string[];  // Glob patterns for files to skip
    guidelines?: string[];  // file/folder paths of guidelines to be followed by the contributor
  };
  chat?: {
    enabled?: boolean;
    persona?: string;       // Custom persona (e.g., "Security Expert")
    instructions?: string[]; // specific guidelines for chat replies
  };
}
```

### Example `CODESPECTER.yml`
Here is a sample configuration you can copy to get started:
```yml
version: 1.0

review:
    enabled: true
    tone: "professional"

    # High Priority Rules (The AI must obey these above all else)
    rules:
        - "STRICT: Do not use `console.log` in production code."
        - "STRICT: All database queries must use the Prisma singleton."
        - "Prefer functional programming patterns over loops where possible."
    
    # Files to ignore during review
    ignore:
        - "db/migrations/*"
        - "**/*.test.ts"
        - "dist/**"

   guidelines:
        - "docs/architecture/BIGGER_PICTURE.md"  # Specific file
        - "team-standards/"                        # Entire folder (reads all .md files inside)
        - "CONTRIBUTING.md"

chat:
    enabled: true
    persona: "Principal Software Architect"
    
    # Instructions for replying to user comments
    instructions:
        - "When asked for code, provide only the snippet and a brief explanation."
        - "Assume the user is using PostgreSQL and TypeScript."
```

---

## 🛠 Tech Stack
- Framework: Next.js (App Router)
- Orchestration: Inngest
- AI Engine: Google Gemini 2.5 Flash (via Vercel AI SDK)
- Database: Prisma + PostgreSQL
- Communication: Octokit 
- Styling: Tailwind CSS, ShadCN UI

## ✅ Prerequisites

### 1. GitHub OAuth
- **GitHub OAuth Application**: Create an OAuth App under your GitHub Developer Settings.
- Set the Authorization callback URL to `${YOUR_APP_URL}/api/auth/callback/github`.
- **Scopes (Permissions)**:  CodeSpecter requests permissions dynamically. Ensure your integration includes the following scopes: `repo`: Grants access to read code and write comments on private/public repositories. `write:repo_hook`: Required to automatically create webhooks for PR tracking.

---

### 2. Google AI Studio
- Generate an **API key** for **Gemini 2.5 Flash**

---

### 3. Inngest
- Install and run the **Inngest Dev Server** for local development

---

## 🚀 Getting Started

### Clone the Repository
```bash
git clone https://github.com/AkshitGarg24/CodeSpecter.git
cd CodeSpecter
```

### Install Dependencies
```bash
bun install
```

### Initialize the Database
```bash
bun x prisma db push
```

### Run Inngest Locally
In a separate terminal:
```bash
npx --ignore-scripts=false inngest-cli@1.14.0 dev
```

### Start the Development Server
```bash
bun run dev
```

## 🔑 Environment Variables
Create a .env file at the project root:
```env
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=
PINECONE_DB_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```
---

## 👨‍💻 Author

Built by **Akshit Garg** 🚀
