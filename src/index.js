import express from "express";
import config from "./config.js";
import reportRouter from "./routes/report.js";

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use("/api", reportRouter);

// Root redirect to health check
app.get("/", (_req, res) => {
  res.json({
    service: "GitHub Access Report",
    version: "1.0.0",
    endpoints: {
      report: "GET /api/report?org=<organization>",
      health: "GET /api/health",
    },
  });
});

// ── Global Error Handler ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("❌ Unhandled error:", err.message);

  res.status(err.status || 500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred."
        : err.message,
  });
});

// ── Start Server ─────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`
┌──────────────────────────────────────────────┐
│  🔐 GitHub Access Report Service             │
│                                              │
│  Server:  http://localhost:${String(config.port).padEnd(5)}             │
│  Report:  GET /api/report?org=<org_name>     │
│  Health:  GET /api/health                    │
└──────────────────────────────────────────────┘
  `);
});
