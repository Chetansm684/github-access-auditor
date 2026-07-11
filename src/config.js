import "dotenv/config";

/**
 * Validates required environment variables and exports
 * a centralized configuration object.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error(
    "❌  GITHUB_TOKEN environment variable is required.\n" +
      "   Create a token at https://github.com/settings/tokens\n" +
      "   Required scopes: read:org, repo\n" +
      "   Then set it in a .env file or export it in your shell."
  );
  process.exit(1);
}

const config = {
  /** GitHub Personal Access Token */
  githubToken: GITHUB_TOKEN,

  /** Server port */
  port: parseInt(process.env.PORT, 10) || 3000,

  /** Default organization (can be overridden via query param) */
  defaultOrg: process.env.DEFAULT_ORG || "",

  /**
   * Max concurrent GitHub API requests for collaborator fetching.
   * GitHub's secondary rate limit is ~100 concurrent requests;
   * we default to 10 for a safe margin.
   */
  maxConcurrency: parseInt(process.env.MAX_CONCURRENCY, 10) || 10,
};

export default config;
