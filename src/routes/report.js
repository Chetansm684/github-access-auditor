import { Router } from "express";
import config from "../config.js";
import { generateAccessReport } from "../services/accessReport.js";

const router = Router();

/**
 * GET /api/report?org=<organization>
 *
 * Generates and returns a full access report for the specified
 * GitHub organization. Falls back to DEFAULT_ORG env var if no
 * query parameter is provided.
 *
 * Query Parameters:
 *   org (string, optional) - GitHub organization login name.
 *                            Required if DEFAULT_ORG is not set.
 *
 * Responses:
 *   200 - Access report JSON
 *   400 - Missing organization parameter
 *   404 - Organization not found
 *   500 - Internal server error
 */
router.get("/report", async (req, res, next) => {
  try {
    const org = req.query.org || config.defaultOrg;

    if (!org) {
      return res.status(400).json({
        error: "Missing required parameter",
        message:
          'Provide an organization name via the "org" query parameter ' +
          "(e.g., /api/report?org=my-org) or set DEFAULT_ORG in your .env file.",
      });
    }

    console.log(`\nGenerating access report for organization: "${org}"`);

    const report = await generateAccessReport(org);

    return res.json(report);
  } catch (err) {
    // Handle specific GitHub API errors with meaningful messages
    if (err.status === 404) {
      return res.status(404).json({
        error: "Organization not found",
        message: `The organization "${req.query.org || config.defaultOrg}" was not found on GitHub. Verify the name and your token's access.`,
      });
    }

    if (err.status === 401) {
      return res.status(401).json({
        error: "Authentication failed",
        message:
          "The provided GITHUB_TOKEN is invalid or expired. " +
          "Generate a new token at https://github.com/settings/tokens",
      });
    }

    if (err.status === 403) {
      return res.status(403).json({
        error: "Insufficient permissions",
        message:
          "The provided GITHUB_TOKEN does not have sufficient permissions. " +
          "Ensure it has read:org and repo scopes.",
      });
    }

    // Pass unexpected errors to Express error handler
    next(err);
  }
});

/**
 * GET /api/health
 *
 * Simple health check endpoint.
 */
router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
