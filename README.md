## CIMD Local OAuth Authorization Server

This project is a **minimal local OAuth 2.0 authorization server example** that implements the
mandatory parts of the **OAuth Client ID Metadata Document (CIMD)** protocol. It is intended for:

- **Trying out the CIMD spec locally**
- **Testing client discovery and registration** using a `client_id` that is itself a URL to a client
  metadata document
- Serving as a **simple reference implementation** for experimentation and learning

The protocol specification is described here:

- `https://oauth.net/2/client-id-metadata-document/`

This server focuses only on what is required by the draft (MUST / MUST NOT) for client discovery and
basic authorization, and intentionally keeps everything else as simple as possible.

---

## Features Implemented

- **Client ID as URL (CIMD)**
  - Accepts `client_id` values that are **HTTPS URLs** pointing to a JSON client metadata document.
  - Validates the URL according to the spec’s **Client Identifier** rules (Section 3 of the draft in `cimd_specs.txt`).

- **Client Metadata Document fetching and validation**
  - Fetches the JSON document from the `client_id` URL.
  - Validates all fields required by the spec for:
    - `client_id` (must match the document URL exactly)
    - forbidden use of shared secrets
    - required metadata for redirect URI matching.

- **Redirect URI registration and validation**
  - Uses the `redirect_uris` array in the client metadata document as the **registered redirect URIs**.
  - Enforces that the `redirect_uri` in an authorization request is an **exact string match** of one
    of the registered URIs (per the draft’s reference to the OAuth security best practices).

- **Minimal OAuth 2.0 endpoints**
  - `/.well-known/oauth-authorization-server` – exposes basic Authorization Server Metadata,
    including a flag indicating support for CIMD.
  - `/authorize` – authorization endpoint (supports both GET and POST) that:
    - validates the client via CIMD,
    - validates `redirect_uri`,
    - shows a **login page** (username/password form),
    - after successful login, generates a **real authorization code** and redirects to the callback.
  - `/token` – token endpoint that:
    - accepts an authorization code grant,
    - validates the authorization code,
    - returns a **real access token** for valid codes.

- **Local OAuth Client App** (`client-app.js`)
  - Test client application that demonstrates the full OAuth flow locally
  - Runs on port 4000 by default
  - Provides `/login` endpoint to initiate the flow
  - Provides `/callback` endpoint to receive authorization code and exchange it for tokens

- **CORS support**
  - Sends permissive CORS headers so that browser-based test clients can call the server from
    different origins (useful for local testing and when using HTTPS tunnels).

---

## Requirements

- **Node.js** (v18 or newer is recommended)
- **npm**

This repository is pure JavaScript (Node + Express) and does not require any database or external
services.

---

## Installation and Setup

From the project root:

```bash
npm install
```

This will install the dependencies defined in `package.json`:

- `express` – HTTP server framework
- `node-fetch` – used to fetch client metadata documents

---

## Running the Server Locally

### Start the Authorization Server

Start the CIMD authorization server:

```bash
npm start
```

By default, the server listens on:

- `http://localhost:3000`

You can override the port by setting the `PORT` environment variable, for example:

```bash
PORT=4000 npm start
```

The server will log a message such as:

```text
CIMD test OAuth server listening on port 3000
```

### Start the Test Client App

In a separate terminal, start the test client application:

```bash
npm run client
```

By default, the client app listens on:

- `http://localhost:4000`

You can configure the client app via environment variables:

```bash
AUTH_SERVER_BASE=http://localhost:3000 \
CLIENT_ID=https://raw.githubusercontent.com/tanish111/cimd-local-oauth-server/refs/heads/main/client-metadata.json \
REDIRECT_URI=http://localhost:4000/callback \
npm run client
```

### Quick Test

1. Start the authorization server: `npm start`
2. Start the client app: `npm run client` (in another terminal)
3. Open your browser to: `http://localhost:4000/login`
4. You'll be redirected to the login page at `http://localhost:3000/authorize`
5. Enter username: `admin`, password: `admin`
6. After login, you'll be redirected back to the client app with an authorization code
7. The client app will automatically exchange the code for an access token and display it

---

## Endpoints Overview

### 1. Authorization Server Metadata

- **Path**: `/.well-known/oauth-authorization-server`
- **Method**: `GET`

Returns a JSON object with:

- `issuer` – the base URL of this server
- `authorization_endpoint` – URL of the authorization endpoint
- `token_endpoint` – URL of the token endpoint
- `client_id_metadata_document_supported` – boolean, set to `true` to indicate CIMD support

This allows clients to discover that the authorization server supports client metadata documents as
described in the CIMD spec.

---

### 2. Authorization Endpoint (`/authorize`)

- **Path**: `/authorize`
- **Methods**:
  - `GET` – traditional browser-style authorization request
  - `POST` – some clients use a POST-form style request; this is supported as well

#### Supported Parameters

For both GET (query string) and POST (form-urlencoded body), the server expects:

- `client_id` – **required**
  - Must be an **HTTPS URL** pointing to a JSON client metadata document.
- `redirect_uri` – **required**
  - Must be one of the URIs listed in the client metadata document’s `redirect_uris` array.
- `response_type` – **required**
  - This implementation only supports `code`.
- `state` – optional
  - If provided, it is echoed back in the redirect.

Other parameters such as `scope`, `code_challenge`, `code_challenge_method` may be present but are
not strictly processed by this minimal server beyond basic presence; the focus here is on CIMD
behavior.

#### What Happens on `/authorize`

1. **Validate `client_id` URL format**
   - Ensures the URL:
     - uses the `https` scheme,
     - contains a non-empty path,
     - does **not** contain `.` or `..` path segments,
     - does **not** contain a fragment (`#...`),
     - does **not** contain a username or password.

2. **Fetch and validate client metadata document**
   - Performs an HTTP GET on the `client_id` URL.
   - Requires the response to be:
     - a successful status code,
     - valid JSON,
     - a JSON object.
   - Validates:
     - `client_id` field **must exist** and **must equal exactly** the document URL.
     - `token_endpoint_auth_method`:
       - **MUST NOT** be any shared-secret-based method such as:
         - `client_secret_post`
         - `client_secret_basic`
         - `client_secret_jwt`
       - Any value beginning with `client_secret_` is also rejected.
     - `client_secret` and `client_secret_expires_at`:
       - **MUST NOT** be present.

3. **Validate redirect URI**
   - Ensures the metadata contains a `redirect_uris` array.
   - Ensures the incoming `redirect_uri` is **exactly equal** (string match) to one of the entries.

4. **Show login page** (GET request)
   - If all validations pass and this is a GET request:
     - Displays an HTML login form with username and password fields.
     - Preserves all OAuth parameters (client_id, redirect_uri, state, etc.) in hidden form fields.

5. **Process login** (POST request)
   - If this is a POST request with username/password:
     - Validates credentials (demo: accepts `admin` / `admin`).
     - On successful login:
       - Generates a **real authorization code** (random, base64url-encoded).
       - Stores the code in memory with expiration (10 minutes).
       - Builds a redirect to the validated `redirect_uri`.
       - Appends:
         - `code=<generated authorization code>`
         - `state=<original state>` (if supplied).
       - Sends an HTTP redirect to that URL.

6. **Errors**
   - If any validation step fails, the server returns a JSON error with:
     - `error: "invalid_request"`
     - `error_description` containing a human-readable explanation including which rule failed.
   - If login fails, the login form is shown again with an error message.

---

### 3. Token Endpoint (`/token`)

- **Path**: `/token`
- **Method**: `POST`
- **Content Type**: `application/x-www-form-urlencoded`

#### Supported Parameters

- `grant_type` – **required**
  - This implementation only supports `authorization_code`.
- `code` – **required**
  - Must be a valid authorization code issued by this server's `/authorize` endpoint.

#### What Happens on `/token`

1. Validates `grant_type`:
   - If it is anything other than `authorization_code`, returns an error:
     - `error: "unsupported_grant_type"`.

2. Validates `code`:
   - Looks up the authorization code in the server's in-memory store.
   - If the code is not found, returns:
     - `error: "invalid_grant"`.
   - If the code has expired (older than 10 minutes), returns:
     - `error: "invalid_grant"` with description indicating expiration.

3. On success:
   - Deletes the authorization code (one-time use).
   - Generates a **real access token** (random, base64url-encoded).
   - Returns a JSON access token response:

```json
{
  "access_token": "<random-base64url-token>",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

The access token is generated per-request and is not backed by any user identity or resource server.
The purpose is to demonstrate the end-to-end OAuth flow with CIMD, not to implement a full
production OAuth server.

---

## Example Client Metadata Document

To test this server, you need to host a client metadata document at an **HTTPS URL**. The document
should look like this:

```json
{
  "client_id": "https://raw.githubusercontent.com/tanish111/cimd-local-oauth-server/refs/heads/main/client-metadata.json",
  "redirect_uris": [
    "http://localhost:4000/callback"
  ],
  "response_types": [
    "code"
  ],
  "grant_types": [
    "authorization_code"
  ],
  "token_endpoint_auth_method": "none"
}
```

A sample `client-metadata.json` file is included in this repository. You can host it on GitHub (as a
raw file URL) or any other HTTPS-capable static file host.

Important rules for this document:

- `client_id` must be the **exact URL** where this JSON is served.
- `redirect_uris` must include the `redirect_uri` you will send to `/authorize` (e.g., `http://localhost:4000/callback` for local testing).
- Do **not** include `client_secret` or `client_secret_expires_at`.
- Do **not** use any `client_secret_*` `token_endpoint_auth_method` values.

---

## Using the Server via an HTTPS Tunnel (Optional)

For local testing, HTTP is sufficient. However, if you want to test with external clients or
services that require HTTPS endpoints, you can run this server locally and expose it via an HTTPS
tunnel (e.g., ngrok):

1. Start the server: `npm start`
2. Start ngrok: `ngrok http 3000`
3. Use the ngrok HTTPS URL (e.g., `https://abc123.ngrok-free.app`) as your authorization server base URL

### Testing with External Tools

Once you have an HTTPS URL from your tunnel, you can use it with OAuth testing tools such as:

- **client.dev** - `https://client.dev`
- **example-app.com/client** - `https://example-app.com/client`

When configuring these tools, use your tunnel HTTPS URL with the following endpoints:

- **Authorization Endpoint**: `https://abc123.ngrok-free.app/authorize`
- **Token Endpoint**: `https://abc123.ngrok-free.app/token`

### Configuration Notes

- Configure your client metadata document to use the HTTPS tunnel URLs for `redirect_uris`.
- Ensure your `client_id` metadata document is still hosted at an HTTPS URL (e.g., GitHub raw URL).
- The server itself does not need to know about the tunnel; it only sees normal HTTP requests on its
  local port.

---

## Relationship to the CIMD Specification

This project is intentionally small and focused. It aims to:

- Demonstrate how an authorization server can:
  - Accept a `client_id` that is a URL.
  - Fetch and validate a client metadata document.
  - Enforce the spec’s required rules (**MUST** and **MUST NOT**) around:
    - URL structure,
    - client metadata contents,
    - shared-secret prohibition,
    - redirect URI registration and exact matching.
- Provide a concrete, runnable example to accompany the CIMD protocol described at:
  - `https://oauth.net/2/client-id-metadata-document/`

It does **not** attempt to be a full, production-ready OAuth 2.0 implementation. Instead, it is a
simple learning and testing tool for local experimentation with the Client ID Metadata Document
concept.

