import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import config from "../config.js";

/**
 * Creates a rate-limit-aware Octokit client.
 *
 * The throttling plugin automatically:
 * - Monitors X-RateLimit-* headers
 * - Pauses before exhausting the primary rate limit
 * - Retries on 403 (rate limit) and 429 (too many requests) with backoff
 */

const ThrottledOctokit = Octokit.plugin(throttling);

const octokit = new ThrottledOctokit({
  auth: config.githubToken,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(
        `Rate limit hit for ${options.method} ${options.url} — ` +
          `retrying after ${retryAfter}s (attempt ${retryCount + 1})`
      );
      // Retry twice, then give up
      return retryCount < 2;
    },
    onSecondaryRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(
        `Secondary rate limit hit for ${options.method} ${options.url} — ` +
          `retrying after ${retryAfter}s (attempt ${retryCount + 1})`
      );
      return retryCount < 2;
    },
  },
});

export default octokit;
