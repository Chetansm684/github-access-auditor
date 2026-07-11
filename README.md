# GitHub Organization Access Report Service

A Node.js service that connects to GitHub and generates a structured report showing which users have access to which repositories within a given organization.

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1. Clone the repository](#1-clone-the-repository)
  - [2. Install dependencies](#2-install-dependencies)
  - [3. Configure authentication](#3-configure-authentication)
  - [4. Start the server](#4-start-the-server)
- [API Endpoints](#api-endpoints)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Design Decisions](#design-decisions)
- [Scale Considerations](#scale-considerations)
- [License](#license)

## Features

- **Authenticate with GitHub** using a Personal Access Token (PAT)
- **Fetch all repositories** for an organization (paginated, handles 100+ repos)
- **Fetch collaborators** for each repository with their permission levels
- **Concurrent fetching** with capped parallelism to stay within GitHub rate limits
- **Dual-view report** — both user→repos and repo→users mappings
- **Resilient** — partial failures don't abort the entire report (`Promise.allSettled`)
- **Automatic rate-limit handling** with retry and exponential backoff

## Prerequisites

- **Node.js** v18 or higher
- A **GitHub Personal Access Token** (PAT). You can use either:
  - **Fine-grained PAT (Recommended):**
    - Repository access: *All repositories* (or select specific ones)
    - Repository permissions: *Administration (Read-only)*
    - Organization permissions: *Members (Read-only)*
  - **Classic PAT:**
    - Scopes: `repo` and `read:org`

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Chetansm684/github-access-auditor.git
cd github-access-auditor
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure authentication

Copy the example environment file and add your GitHub token:

```bash
cp .env.example .env
```

Edit `.env` and set your token:

```env
GITHUB_TOKEN=ghp_your_actual_token_here
```

#### How to create a GitHub token

**For Fine-grained PATs (Recommended):**
1. Go to [GitHub Settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. Click **"Generate new token"**
3. Under **Resource owner**, select the organization
4. Under **Repository access**, select **"All repositories"**
5. Under **Repository permissions**, set **"Administration"** to **"Read-only"** *(Note: GitHub requires this specific permission to list repository collaborators)*
6. Under **Organization permissions**, set **"Members"** to **"Read-only"**
7. Copy the generated token into your `.env` file

### 4. Start the server

```bash
npm start
```

You should see:

```
┌──────────────────────────────────────────────┐
│  🔐 GitHub Access Report Service             │
│                                              │
│  Server:  http://localhost:3000              │
│  Report:  GET /api/report?org=<org_name>     │
│  Health:  GET /api/health                    │
└──────────────────────────────────────────────┘
```

### 5. Test the API

Now that the server is running, open a **new terminal window** and run this command to generate a report for your organization:

```bash
curl "http://localhost:3000/api/report?org=your-organization-name"
```

Alternatively, you can just open `http://localhost:3000/api/report?org=your-organization-name` in your web browser!

## API Endpoints

### `GET /api/report?org=<organization>`

Generates an access report for the specified GitHub organization.

**Query Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `org`     | Yes*     | GitHub organization login name. *Optional if `DEFAULT_ORG` is set in `.env`. |

**Example request:**

```bash
curl http://localhost:3000/api/report?org=my-org
```

**Example response:**

```json
{
  "organization": "my-org",
  "generatedAt": "2026-07-11T06:00:00.000Z",
  "generationTimeMs": 4523,
  "summary": {
    "totalRepositories": 42,
    "totalUsers": 128
  },
  "users": {
    "octocat": {
      "repositories": [
        { "name": "web-app", "permission": "admin", "private": true },
        { "name": "api-service", "permission": "write", "private": false }
      ]
    }
  },
  "repositories": {
    "web-app": {
      "private": true,
      "url": "https://github.com/my-org/web-app",
      "collaborators": [
        { "login": "octocat", "permission": "admin" },
        { "login": "devuser", "permission": "read" }
      ]
    }
  }
}
```

**Error responses:**

| Status | Cause |
|--------|-------|
| `400`  | Missing `org` parameter and no `DEFAULT_ORG` configured |
| `401`  | Invalid or expired GitHub token |
| `403`  | Token lacks required scopes |
| `404`  | Organization not found |
| `500`  | Unexpected server error |

### `GET /api/health`

Health check endpoint.

```bash
curl http://localhost:3000/api/health
# {"status":"ok","timestamp":"2026-07-11T06:00:00.000Z"}
```

### `GET /`

Returns service info and available endpoints.

## Configuration

All configuration is done via environment variables (`.env` file):

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | ✅ | — | GitHub PAT with `read:org` and `repo` scopes |
| `PORT` | No | `3000` | Server port |
| `DEFAULT_ORG` | No | — | Default organization (can be overridden via `?org=`) |
| `MAX_CONCURRENCY` | No | `10` | Max parallel GitHub API requests |

## Architecture

```
src/
├── index.js              # Express server bootstrap
├── config.js             # Env var loading and validation
├── github/
│   ├── client.js         # Octokit instance with throttling plugin
│   ├── repos.js          # Paginated org repo fetching
│   └── collaborators.js  # Paginated collaborator fetching
├── services/
│   └── accessReport.js   # Orchestrator: fetch → aggregate → report
└── routes/
    └── report.js         # API endpoint definitions
```

### Data Flow

1. **Client** calls `GET /api/report?org=acme`
2. **Route handler** validates the request and calls the service layer
3. **Service** fetches all organization repos (paginated, sequential)
4. **Service** concurrently fetches collaborators for each repo (capped at `MAX_CONCURRENCY`)
5. **Service** aggregates into dual user-centric and repo-centric views
6. **Route handler** returns the JSON report

## Design Decisions

### Why REST API over GraphQL?

While GitHub's GraphQL API can fetch nested data in fewer requests, it has complexity limits that make deeply nested queries (repos → collaborators with pagination on both levels) unreliable for large organizations. The REST API with `octokit.paginate()` is more predictable and robust at scale.

### Why `p-limit` instead of unlimited concurrency?

GitHub enforces secondary rate limits at approximately 100 concurrent requests. We default to 10 parallel requests for a safe margin while still being ~10x faster than sequential processing. This is configurable via `MAX_CONCURRENCY`.

### Why `Promise.allSettled` over `Promise.all`?

In a large organization, some repositories may fail (permission denied, temporary errors). `Promise.allSettled` ensures one repo's failure doesn't abort the entire report. Failed repos are reported in the `errors` array.

### Why dual-view (users + repositories)?

The primary requirement asks "which repositories each user has access to" (user-centric). However, the inverse view "which users have access to each repository" (repo-centric) is equally important for security auditing. Both views are computed from the same data in a single pass.

### Why Octokit's throttling plugin?

The `@octokit/plugin-throttling` handles both primary rate limits (5000 req/hour for PATs) and secondary/abuse rate limits automatically with exponential backoff. This means the service gracefully handles large organizations without manual retry logic.

## Scale Considerations

| Concern | Solution |
|---------|----------|
| 100+ repos | Paginated fetching with `per_page=100` minimizes API calls |
| 1000+ users | Efficient map-based aggregation, O(n) memory |
| Rate limits | Throttling plugin with auto-retry on 403/429 |
| Concurrency | Capped at 10 (configurable) to avoid secondary limits |
| Partial failures | `Promise.allSettled` for resilience |

## License

MIT
