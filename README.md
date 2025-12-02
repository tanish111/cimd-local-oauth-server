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
  - `/authorize` – minimal authorization endpoint (supports both GET and POST) that:
    - validates the client via CIMD,
    - validates `redirect_uri`,
    - returns a **dummy authorization code** via redirect.
  - `/token` – minimal token endpoint that:
    - accepts an authorization code grant,
    - returns a **dummy access token** for that code.

- **CORS support**
  - Sends permissive CORS headers so that browser-based test clients can call the server when it is
    exposed over HTTPS (for example via a tunneling tool) from a different origin.

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

Start the server:

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

4. **Issue a dummy authorization code**
   - If all validations pass:
     - Builds a redirect to the validated `redirect_uri`.
     - Appends:
       - `code=cimd-demo-code`
       - `state=<original state>` (if supplied).
   - Sends an HTTP redirect to that URL.

5. **Errors**
   - If any step fails, the server returns a JSON error with:
     - `error: "invalid_request"`
     - `error_description` containing a human-readable explanation including which rule failed.

---

### 3. Token Endpoint (`/token`)

- **Path**: `/token`
- **Method**: `POST`
- **Content Type**: `application/x-www-form-urlencoded`

#### Supported Parameters

- `grant_type` – **required**
  - This implementation only supports `authorization_code`.
- `code` – **required**
  - Must equal `cimd-demo-code`, which is the code issued by this server’s `/authorize` endpoint.

#### What Happens on `/token`

1. Validates `grant_type`:
   - If it is anything other than `authorization_code`, returns an error:
     - `error: "unsupported_grant_type"`.

2. Validates `code`:
   - If `code` is not `cimd-demo-code`, returns:
     - `error: "invalid_grant"`.

3. On success, returns a JSON access token response:

```json
{
  "access_token": "cimd-demo-access-token",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

This is a **dummy token** and is not backed by any storage or user identity. The purpose is to show
the end-to-end flow, not to implement a full OAuth server.

---

## Example Client Metadata Document

To test this server, you need to host a client metadata document at an **HTTPS URL**. The document
should look like this (adjust the URLs to match where you host it):

```json
{
  "client_id": "https://client.example.com/oauth/metadata.json",
  "redirect_uris": [
    "https://client.example.com/oauth/callback"
  ],
  "response_types": [
    "code"
  ],
  "grant_types": [
    "authorization_code"
  ],
  "scope": "openid profile email",
  "token_endpoint_auth_method": "none"
}
```

Important rules for this document:

- `client_id` must be the **exact URL** where this JSON is served.
- `redirect_uris` must include the `redirect_uri` you will send to `/authorize`.
- Do **not** include `client_secret` or `client_secret_expires_at`.
- Do **not** use any `client_secret_*` `token_endpoint_auth_method` values.

---

## Example Authorization Request (Local)

Assuming:

- Server is running at `http://localhost:3000`.
- Client metadata document is hosted at:
  - `https://client.example.com/oauth/metadata.json`
- Redirect URI in the metadata is:
  - `https://client.example.com/oauth/callback`

You can initiate an authorization request in a browser by constructing a URL like:

```text
http://localhost:3000/authorize
  ?response_type=code
  &client_id=https%3A%2F%2Fclient.example.com%2Foauth%2Fmetadata.json
  &redirect_uri=https%3A%2F%2Fclient.example.com%2Foauth%2Fcallback
  &state=xyz
```

If everything is valid, you will be redirected to:

```text
https://client.example.com/oauth/callback?code=cimd-demo-code&state=xyz
```

---

## Example Token Request (Local)

After receiving `code=cimd-demo-code` from the `/authorize` redirect, you can exchange it for a
token:

```bash
curl -X POST http://localhost:3000/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=cimd-demo-code"
```

You should receive a JSON token response similar to:

```json
{
  "access_token": "cimd-demo-access-token",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

## Using the Server via an HTTPS Tunnel

If you want to test CIMD clients that require HTTPS endpoints, you can run this server locally and
expose it via an HTTPS tunnel so that the outside world sees URLs like:

- `https://your-tunnel.example.com/authorize`
- `https://your-tunnel.example.com/token`

In that case:

- Configure your client to use those HTTPS endpoints as the **authorization endpoint** and
  **token endpoint**.
- Ensure that your `client_id` metadata document and registered `redirect_uris` still use HTTPS and
  follow the CIMD rules.

The server itself does not need to know about the tunnel; it only sees normal HTTP requests on its
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

