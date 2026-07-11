import octokit from "./client.js";

/**
 * Fetches all collaborators for a specific repository.
 * Uses automatic pagination with per_page=100 to minimize API calls.
 *
 * Requires the authenticated user to have push access (or higher)
 * to the repository.
 *
 * @param {string} owner - Repository owner (organization login)
 * @param {string} repo  - Repository name
 * @returns {Promise<Array<{login: string, permission: string}>>}
 */
export async function fetchRepoCollaborators(owner, repo) {
  const collaborators = await octokit.paginate(
    octokit.rest.repos.listCollaborators,
    {
      owner,
      repo,
      per_page: 100,
      affiliation: "all",
    },
    (response) =>
      response.data.map((user) => ({
        login: user.login,
        // role_name provides the human-readable permission level
        // (e.g., "admin", "write", "read", "maintain", "triage")
        permission: user.role_name || derivePermission(user.permissions),
      }))
  );

  return collaborators;
}

/**
 * Fallback permission derivation from the permissions object
 * when role_name is not available.
 *
 * @param {Object} permissions - { admin, maintain, push, triage, pull }
 * @returns {string} Highest permission level
 */
function derivePermission(permissions) {
  if (!permissions) return "unknown";
  if (permissions.admin) return "admin";
  if (permissions.maintain) return "maintain";
  if (permissions.push) return "write";
  if (permissions.triage) return "triage";
  if (permissions.pull) return "read";
  return "none";
}
