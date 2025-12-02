import express from "express";
import fetch from "node-fetch";

// Simple OAuth client application to test the CIMD server locally.
// Inspired by typical oidc-provider / openid-client callback flows.
//
// Flow:
//   1. GET /login  -> redirects to authorization endpoint
//   2. GET /callback -> receives ?code=, exchanges it at /token, shows result
//
// Configure via env vars:
//   AUTH_SERVER_BASE  - base URL of your CIMD auth server (e.g. http://localhost:3000 or https://<ngrok>.ngrok-free.app)
//   CLIENT_ID         - client_id (CIMD URL, e.g. your GitHub raw metadata URL)
//   REDIRECT_URI      - this client's callback URL (e.g. http://localhost:4000/callback)

const AUTH_SERVER_BASE = process.env.AUTH_SERVER_BASE || "http://localhost:3000";
const CLIENT_ID =
  process.env.CLIENT_ID ||
  "https://raw.githubusercontent.com/tanish111/cimd-local-oauth-server/refs/heads/main/client-metadata.json";
const CLIENT_PORT = process.env.CLIENT_PORT || 4000;
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${CLIENT_PORT}/callback`;

const AUTHORIZATION_ENDPOINT = `${AUTH_SERVER_BASE}/authorize`;
const TOKEN_ENDPOINT = `${AUTH_SERVER_BASE}/token`;

const app = express();

/**
 * Kick off the OAuth authorization code flow.
 * Redirects the browser to the CIMD server's /authorize endpoint.
 */
app.get("/login", (req, res) => {
  const state = Math.random().toString(36).slice(2);

  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);

  res.redirect(url.toString());
});

/**
 * OAuth callback endpoint.
 * Receives ?code= from the CIMD server and exchanges it at /token,
 * then shows the token response as JSON.
 */
app.get("/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res
      .status(400)
      .send(`Authorization error: ${error} - ${error_description || "no description"}`);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    const tokenRes = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(code),
      }),
    });

    const tokenJson = await tokenRes.json();

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>CIMD OAuth Client Callback</title>
  </head>
  <body>
    <h1>CIMD OAuth Client Callback</h1>
    <p><strong>Code:</strong> ${code}</p>
    <p><strong>State:</strong> ${state || "(none)"}</p>
    <h2>Token response</h2>
    <pre>${JSON.stringify(tokenJson, null, 2)}</pre>
  </body>
</html>
    `);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).send(`Token request failed: ${message}`);
  }
});

app.get("/", (req, res) => {
  res.send(
    `CIMD OAuth client app is running on port ${CLIENT_PORT}. Visit <a href="/login">/login</a> to start the flow.`
  );
});

app.listen(CLIENT_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CIMD OAuth client app listening on http://localhost:${CLIENT_PORT}`);
});


