import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Very permissive CORS for demo/testing purposes so browser-based
// clients (e.g. https://client.dev) can call the ngrok-hosted server.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

/**
 * Validate that the client_id is a URL that meets CIMD mandatory requirements.
 * See Section 3. Client Identifier.
 */
function validateClientIdUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("invalid_client_id: client_id must be a valid URL");
  }

  // MUST have https scheme
  if (url.protocol !== "https:") {
    throw new Error("invalid_client_id: client_id URL MUST use https scheme");
  }

  // MUST contain a path component (cannot be empty or just "/")
  if (!url.pathname || url.pathname === "/") {
    throw new Error("invalid_client_id: client_id URL MUST contain a path component");
  }

  // MUST NOT contain single-dot or double-dot path segments
  const segments = url.pathname.split("/");
  if (segments.some((s) => s === "." || s === "..")) {
    throw new Error(
      "invalid_client_id: client_id URL MUST NOT contain single-dot or double-dot path segments"
    );
  }

  // MUST NOT contain a fragment component
  if (url.hash) {
    throw new Error("invalid_client_id: client_id URL MUST NOT contain a fragment component");
  }

  // MUST NOT contain a username or password
  if (url.username || url.password) {
    throw new Error(
      "invalid_client_id: client_id URL MUST NOT contain a username or password component"
    );
  }

  return url.toString();
}

/**
 * Fetch and validate the client metadata document from the client_id URL.
 * Implements MUST / MUST NOT rules from Section 4.1.
 */
async function fetchAndValidateClientMetadata(clientIdUrl) {
  const res = await fetch(clientIdUrl, {
    method: "GET",
    headers: {
      Accept: "application/json, application/*+json",
    },
  });

  if (!res.ok) {
    throw new Error("invalid_client: failed to fetch client metadata document");
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("invalid_client: client metadata document is not valid JSON");
  }

  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new Error("invalid_client: client metadata document must be a JSON object");
  }

  // MUST contain a client_id property equal to the URL of the document
  if (!Object.prototype.hasOwnProperty.call(json, "client_id")) {
    throw new Error("invalid_client: client metadata document MUST contain client_id");
  }
  if (json.client_id !== clientIdUrl) {
    throw new Error(
      "invalid_client: client_id property in metadata document MUST match the document URL"
    );
  }

  // MUST NOT include certain token_endpoint_auth_method values
  const forbiddenAuthMethods = new Set([
    "client_secret_post",
    "client_secret_basic",
    "client_secret_jwt",
  ]);

  if (json.token_endpoint_auth_method) {
    if (forbiddenAuthMethods.has(json.token_endpoint_auth_method)) {
      throw new Error(
        "invalid_client: token_endpoint_auth_method MUST NOT be a shared secret based method"
      );
    }
    // Be conservative and disallow any method starting with client_secret_
    if (String(json.token_endpoint_auth_method).startsWith("client_secret_")) {
      throw new Error(
        "invalid_client: token_endpoint_auth_method MUST NOT be a shared secret based method"
      );
    }
  }

  // client_secret and client_secret_expires_at MUST NOT be used
  if (Object.prototype.hasOwnProperty.call(json, "client_secret")) {
    throw new Error("invalid_client: client_secret MUST NOT be present in client metadata");
  }
  if (Object.prototype.hasOwnProperty.call(json, "client_secret_expires_at")) {
    throw new Error(
      "invalid_client: client_secret_expires_at MUST NOT be present in client metadata"
    );
  }

  return json;
}

/**
 * Very small in-memory registration view: we don't persist,
 * but we validate redirect_uri against metadata.redirect_uris
 * at authorization time, per RFC9700 (exact match requirement).
 */
function validateRedirectUri(requestedRedirectUri, metadata) {
  if (!requestedRedirectUri) {
    throw new Error("invalid_request: redirect_uri is required");
  }
  const redirectUris = metadata.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    throw new Error("invalid_client: client metadata must include redirect_uris array");
  }
  const match = redirectUris.find((u) => u === requestedRedirectUri);
  if (!match) {
    throw new Error(
      "invalid_request: redirect_uri MUST exactly match one of the registered redirect_uris"
    );
  }
}

// Minimal Authorization Server Metadata
app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const issuer = process.env.ISSUER || `http://localhost:${PORT}`;
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    client_id_metadata_document_supported: true,
  });
});

async function handleAuthorize(req, res, params) {
  const { client_id: rawClientId, redirect_uri, response_type, state } = params;

  try {
    if (!rawClientId) {
      throw new Error("invalid_request: client_id is required");
    }
    if (!response_type) {
      throw new Error("invalid_request: response_type is required");
    }

    // For simplicity we only support the authorization code flow here
    if (response_type !== "code") {
      throw new Error("unsupported_response_type: only response_type=code is supported");
    }

    const clientIdUrl = validateClientIdUrl(String(rawClientId));
    const metadata = await fetchAndValidateClientMetadata(clientIdUrl);
    validateRedirectUri(String(redirect_uri), metadata);

    // In a real server, we would now authenticate the user, get consent,
    // generate an authorization code, and redirect. Here we only demonstrate
    // successful validation and a dummy code.
    const dummyCode = "cimd-demo-code";
    const url = new URL(String(redirect_uri));
    url.searchParams.set("code", dummyCode);
    if (state) {
      url.searchParams.set("state", String(state));
    }

    res.redirect(url.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "server_error";
    res.status(400).json({ error: "invalid_request", error_description: message });
  }
}

/**
 * Minimal /authorize endpoint (GET)
 * This does not implement full OAuth, but demonstrates CIMD-based
 * client registration handling and validation.
 */
app.get("/authorize", async (req, res) => {
  await handleAuthorize(req, res, req.query);
});

/**
 * Minimal /authorize endpoint (POST)
 * Some OAuth clients send POST requests to the authorization endpoint.
 * We accept application/x-www-form-urlencoded here and reuse the same logic.
 */
app.post("/authorize", express.urlencoded({ extended: false }), async (req, res) => {
  await handleAuthorize(req, res, req.body || {});
});

/**
 * Minimal /token endpoint stub.
 * Returns a dummy token for the dummy code. This is just to complete the flow.
 */
app.post("/token", express.urlencoded({ extended: false }), (req, res) => {
  const { grant_type, code } = req.body || {};

  if (grant_type !== "authorization_code") {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code is supported in this demo",
    });
  }

  if (code !== "cimd-demo-code") {
    return res.status(400).json({
      error: "invalid_grant",
      error_description: "Invalid or expired authorization code",
    });
  }

  // Return a small dummy access token
  res.json({
    access_token: "cimd-demo-access-token",
    token_type: "Bearer",
    expires_in: 3600,
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`CIMD test OAuth server listening on port ${PORT}`);
});


