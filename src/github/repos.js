import octokit from "./client.js";

/**
 * Fetches all repositories for a GitHub organization.
 * Uses automatic pagination with per_page=100 to minimize API calls.
 *
 * @param {string} org - GitHub organization login name
 * @returns {Promise<Array<{name: string, fullName: string, private: boolean, url: string}>>}
 */
export async function fetchOrgRepos(org) {
  const repos = await octokit.paginate(
    octokit.rest.repos.listForOrg,
    {
      org,
      per_page: 100,
      type: "all",
    },
    (response) =>
      response.data.map((repo) => ({
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        url: repo.html_url,
      }))
  );

  return repos;
}
