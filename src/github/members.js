import octokit from "./client.js";

/**
 * Fetches all members of a GitHub organization.
 * Uses automatic pagination with per_page=100.
 *
 * This is a fallback data source when the token lacks push access
 * to individual repos (required by the collaborators endpoint).
 *
 * @param {string} org - GitHub organization login name
 * @returns {Promise<Array<{login: string, role: string}>>}
 */
export async function fetchOrgMembers(org) {
  const members = await octokit.paginate(
    octokit.rest.orgs.listMembers,
    {
      org,
      per_page: 100,
    },
    (response) =>
      response.data.map((member) => ({
        login: member.login,
      }))
  );

  return members;
}
