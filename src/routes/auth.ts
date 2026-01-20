import { Hono } from "hono";
import { config, isGithubEnabled, isGoogleEnabled } from "../config";
import {
  hashPassword,
  verifyPassword,
  createUser,
  getUserByEmail,
  getUserByOAuth,
  linkOAuthAccount,
  createSession,
  deleteSession,
  getSessionUser,
  updateUserAvatar,
} from "../auth";

const auth = new Hono();

// Get current user
auth.get("/me", async (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return c.json({ user: null });
  }

  const user = getSessionUser(token);
  return c.json({ user });
});

// Get available auth providers
auth.get("/providers", (c) => {
  return c.json({
    email: true,
    github: isGithubEnabled(),
    google: isGoogleEnabled(),
  });
});

// Email/password signup
auth.post("/signup", async (c) => {
  const { email, password, name } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  if (password.length < 8) {
    return c.json({ error: "Password must be at least 8 characters" }, 400);
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return c.json({ error: "Email already registered" }, 400);
  }

  const passwordHash = await hashPassword(password);
  const userId = createUser(email, passwordHash, name);
  const token = createSession(userId);

  return c.json({ token, user: { id: userId, email, name } });
});

// Email/password signin
auth.post("/signin", async (c) => {
  const { email, password } = await c.req.json();

  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const user = getUserByEmail(email);
  if (!user || !user.password_hash) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = createSession(user.id);
  return c.json({ token, user: { id: user.id, email: user.email, name: user.name } });
});

// Logout
auth.post("/logout", (c) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (token) {
    deleteSession(token);
  }
  return c.json({ success: true });
});

// GitHub OAuth - redirect to GitHub
auth.get("/github", (c) => {
  if (!isGithubEnabled()) {
    return c.json({ error: "GitHub auth not configured" }, 400);
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: `${config.baseUrl}/api/auth/github/callback`,
    scope: "user:email",
    state,
  });

  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
auth.get("/github/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.redirect("/?error=github_auth_failed");
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: config.github.clientId,
        client_secret: config.github.clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      return c.redirect("/?error=github_auth_failed");
    }

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const githubUser = await userRes.json() as { id: number; login: string; email?: string; name?: string; avatar_url?: string };

    // Get primary email if not public
    let email = githubUser.email;
    if (!email) {
      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const emails = await emailsRes.json() as Array<{ email: string; primary: boolean }>;
      const primary = emails.find((e) => e.primary);
      email = primary?.email;
    }

    if (!email) {
      return c.redirect("/?error=github_no_email");
    }

    // Find or create user
    let user = getUserByOAuth("github", String(githubUser.id));
    if (!user) {
      const existing = getUserByEmail(email);
      if (existing) {
        // Link GitHub to existing account
        linkOAuthAccount(existing.id, "github", String(githubUser.id));
        if (githubUser.avatar_url) {
          updateUserAvatar(existing.id, githubUser.avatar_url);
        }
        user = existing;
      } else {
        // Create new user
        const userId = createUser(email, null, githubUser.name || githubUser.login, githubUser.avatar_url);
        linkOAuthAccount(userId, "github", String(githubUser.id));
        user = { id: userId, email, name: githubUser.name || githubUser.login, avatar_url: githubUser.avatar_url || null };
      }
    } else if (githubUser.avatar_url) {
      // Update avatar on existing user login
      updateUserAvatar(user.id, githubUser.avatar_url);
    }

    const token = createSession(user.id);
    return c.redirect(`/?token=${token}`);
  } catch (error) {
    console.error("GitHub auth error:", error);
    return c.redirect("/?error=github_auth_failed");
  }
});

// Google OAuth - redirect to Google
auth.get("/google", (c) => {
  if (!isGoogleEnabled()) {
    return c.json({ error: "Google auth not configured" }, 400);
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.baseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "email profile",
    state,
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google OAuth callback
auth.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) {
    return c.redirect("/?error=google_auth_failed");
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${config.baseUrl}/api/auth/google/callback`,
      }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string };
    if (!tokenData.access_token) {
      return c.redirect("/?error=google_auth_failed");
    }

    // Get user info
    const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = await userRes.json() as { id: string; email: string; name?: string; picture?: string };

    if (!googleUser.email) {
      return c.redirect("/?error=google_no_email");
    }

    // Find or create user
    let user = getUserByOAuth("google", googleUser.id);
    if (!user) {
      const existing = getUserByEmail(googleUser.email);
      if (existing) {
        linkOAuthAccount(existing.id, "google", googleUser.id);
        if (googleUser.picture) {
          updateUserAvatar(existing.id, googleUser.picture);
        }
        user = existing;
      } else {
        const userId = createUser(googleUser.email, null, googleUser.name, googleUser.picture);
        linkOAuthAccount(userId, "google", googleUser.id);
        user = { id: userId, email: googleUser.email, name: googleUser.name || null, avatar_url: googleUser.picture || null };
      }
    } else if (googleUser.picture) {
      // Update avatar on existing user login
      updateUserAvatar(user.id, googleUser.picture);
    }

    const token = createSession(user.id);
    return c.redirect(`/?token=${token}`);
  } catch (error) {
    console.error("Google auth error:", error);
    return c.redirect("/?error=google_auth_failed");
  }
});

export { auth };
