import { Hono } from "hono";

const webhook = new Hono();

// GitHub webhook endpoint for auto-deploy
webhook.post("/github", async (c) => {
  const event = c.req.header("X-GitHub-Event");

  // Only handle push events
  if (event !== "push") {
    return c.json({ message: "Ignored non-push event", event }, 200);
  }

  try {
    const payload = await c.req.json();
    const branch = payload.ref?.replace("refs/heads/", "");

    // Only deploy from main branch
    if (branch !== "main") {
      return c.json({ message: "Ignored non-main branch", branch }, 200);
    }

    console.log(`[Webhook] Received push to main from ${payload.pusher?.name || "unknown"}`);
    console.log(`[Webhook] Commit: ${payload.head_commit?.message || "no message"}`);

    // Run git pull
    const gitPull = Bun.spawn(["git", "pull"], {
      cwd: "/home/sprite/spaced-repetition",
      stdout: "pipe",
      stderr: "pipe",
    });

    const pullOutput = await new Response(gitPull.stdout).text();
    const pullError = await new Response(gitPull.stderr).text();
    await gitPull.exited;

    if (gitPull.exitCode !== 0) {
      console.error(`[Webhook] Git pull failed: ${pullError}`);
      return c.json({ error: "Git pull failed", details: pullError }, 500);
    }

    console.log(`[Webhook] Git pull successful: ${pullOutput.trim()}`);

    // Restart the service via sprite-env
    const restart = Bun.spawn(["sprite-env", "services", "restart", "spaced-repetition"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    // Don't wait for restart to complete (it will kill this process)
    // Just return success
    console.log("[Webhook] Service restart triggered");

    return c.json({
      success: true,
      branch,
      commit: payload.head_commit?.id?.slice(0, 7),
      message: payload.head_commit?.message,
      pullOutput: pullOutput.trim(),
    });
  } catch (err) {
    console.error("[Webhook] Error:", err);
    return c.json({ error: "Webhook processing failed", details: String(err) }, 500);
  }
});

// Health check endpoint
webhook.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

export { webhook };
