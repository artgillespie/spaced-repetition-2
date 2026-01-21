import { Hono } from "hono";
import { config } from "../config";

const webhook = new Hono();

// Verify GitHub webhook signature
async function verifyGitHubSignature(payload: string, signature: string | undefined): Promise<boolean> {
  if (!config.githubWebhookSecret) {
    console.warn("[Webhook] No secret configured - skipping signature verification");
    return true; // Allow if no secret configured (not recommended for production)
  }

  if (!signature) {
    return false;
  }

  // GitHub sends signature as "sha256=<hex>"
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    return false;
  }

  const signatureHex = signature.slice(expectedPrefix.length);

  // Compute HMAC-SHA256
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(config.githubWebhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const computedHex = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time comparison to prevent timing attacks
  if (computedHex.length !== signatureHex.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < computedHex.length; i++) {
    result |= computedHex.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return result === 0;
}

// GitHub webhook endpoint for auto-deploy
webhook.post("/github", async (c) => {
  const signature = c.req.header("X-Hub-Signature-256");
  const event = c.req.header("X-GitHub-Event");

  // Get raw body for signature verification
  const rawBody = await c.req.text();

  // Verify signature
  const isValid = await verifyGitHubSignature(rawBody, signature);
  if (!isValid) {
    console.warn("[Webhook] Invalid signature - request rejected");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Only handle push events
  if (event !== "push") {
    return c.json({ message: "Ignored non-push event", event }, 200);
  }

  try {
    const payload = JSON.parse(rawBody);
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

    // Restart the service via sprite-env (stop + start since restart may not work)
    // Do this in background since stop will kill this process
    Bun.spawn(["sh", "-c", "sleep 1 && sprite-env services stop spaced-repetition && sprite-env services start spaced-repetition"], {
      stdout: "ignore",
      stderr: "ignore",
    });

    console.log("[Webhook] Service restart triggered (stop + start in background)");

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
