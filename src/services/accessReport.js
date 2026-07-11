import pLimit from "p-limit";
import config from "../config.js";
import { fetchOrgRepos } from "../github/repos.js";
import { fetchRepoCollaborators } from "../github/collaborators.js";
import { fetchOrgMembers } from "../github/members.js";

/**
 * Generates a complete access report for a GitHub organization.
 *
 * Strategy:
 * 1. Fetch all repos and org members in parallel
 * 2. Fetch collaborators for each repo concurrently (capped by p-limit)
 * 3. If collaborator fetch fails (e.g., 403), still list the repo
 * 4. Aggregate into dual views: user-centric and repo-centric
 *
 * Uses Promise.allSettled for resilience — a single repo failure
 * won't abort the entire report.
 *
 * @param {string} org - GitHub organization login name
 * @returns {Promise<Object>} Structured access report
 */
export async function generateAccessReport(org) {
  const startTime = Date.now();

  // --- Step 1: Fetch repos and org members in parallel ---
  const [repos, orgMembers] = await Promise.all([
    fetchOrgRepos(org),
    fetchOrgMembers(org).catch((err) => {
      console.warn(`⚠️  Could not fetch org members: ${err.message}`);
      return null;
    }),
  ]);

  console.log(`Fetched ${repos.length} repositories for "${org}"`);
  if (orgMembers) {
    console.log(`Fetched ${orgMembers.length} organization members`);
  }

  // --- Step 2: Fetch collaborators concurrently (with cap) ---
  const limit = pLimit(config.maxConcurrency);

  const collaboratorResults = await Promise.allSettled(
    repos.map((repo) =>
      limit(async () => {
        const collaborators = await fetchRepoCollaborators(org, repo.name);
        return { repo, collaborators };
      })
    )
  );

  // --- Step 3: Aggregate results ---
  /** @type {Record<string, {repositories: Array}>} */
  const userMap = {};

  /** @type {Record<string, {private: boolean, url: string, collaborators: Array}>} */
  const repoMap = {};

  const errors = [];
  let collaboratorAccessAvailable = false;

  for (let i = 0; i < collaboratorResults.length; i++) {
    const result = collaboratorResults[i];
    const repo = repos[i];

    if (result.status === "rejected") {
      // Still include the repo in the report, but without collaborator data
      repoMap[repo.name] = {
        private: repo.private,
        url: repo.url,
        collaborators: [],
        error: "Could not fetch collaborators (insufficient permissions)",
      };

      errors.push({
        repository: repo.name,
        message: result.reason?.message || "Unknown error",
      });
      continue;
    }

    collaboratorAccessAvailable = true;
    const { collaborators } = result.value;

    // Build repo-centric view
    repoMap[repo.name] = {
      private: repo.private,
      url: repo.url,
      collaborators: collaborators.map((c) => ({
        login: c.login,
        permission: c.permission,
      })),
    };

    // Build user-centric view
    for (const collab of collaborators) {
      if (!userMap[collab.login]) {
        userMap[collab.login] = { repositories: [] };
      }
      userMap[collab.login].repositories.push({
        name: repo.name,
        permission: collab.permission,
        private: repo.private,
      });
    }
  }

  const elapsedMs = Date.now() - startTime;

  const report = {
    organization: org,
    generatedAt: new Date().toISOString(),
    generationTimeMs: elapsedMs,
    summary: {
      totalRepositories: repos.length,
      totalUsers: Object.keys(userMap).length,
      ...(orgMembers && { totalOrgMembers: orgMembers.length }),
      ...(errors.length > 0 && {
        reposWithErrors: errors.length,
      }),
    },
    users: userMap,
    repositories: repoMap,
    // Include org members when collaborator-level access isn't available
    ...(orgMembers && {
      organizationMembers: orgMembers.map((m) => m.login),
    }),
    ...(errors.length > 0 && { errors }),
  };

  // Provide guidance if all collaborator fetches failed
  if (!collaboratorAccessAvailable && repos.length > 0) {
    report.note =
      "Collaborator details could not be fetched. The GitHub API requires push access " +
      "(or admin/org owner) to list repository collaborators. Your token may only have " +
      "read access. The report still includes all discovered repositories and organization " +
      "members. To get full collaborator details, use a token with push access or an " +
      "org admin/owner token.";
  }

  console.log(
    `Report generated in ${elapsedMs}ms — ` +
      `${report.summary.totalRepositories} repos, ` +
      `${report.summary.totalUsers} users` +
      (errors.length > 0 ? `, ${errors.length} errors` : "")
  );

  return report;
}
