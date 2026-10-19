#!/usr/bin/env python3
"""Deploy LazyGig (Worker + Workers AI binding + Superteam secret) via the Cloudflare API.

- Binds Workers AI as `AI` (open-weight Llama 3.1 8B, free tier).
- Sets SUPERTEAM_API_KEY as a Worker secret from the local 0600 credentials
  file (never printed, never bundled into the script).
Auth via the stored custom.cloudflare credential (surrogate).

Usage: python3 deploy.py [--script-name lazygig] [--bundle dist/worker.js]
"""
import argparse
import json
import os
import sys
import urllib.request

sys.path.insert(0, "/opt/muse/skills/custom-connector-setup/bin")
from dynamic_credentials import add_surrogate_to_request, read_json_response

API_BASE = "https://api.cloudflare.com/client/v4"
ALLOWED_HOSTS = ["api.cloudflare.com"]
CREDENTIAL = "custom.cloudflare"
BOUNDARY = "----lazygigdeploy7f3a"
SUPERTEAM_CREDS = os.path.expanduser(
    "~/workspace/x402-services/credentials/superteam-earn.json")


def api(method, path, body=None, ctype=None):
    req = urllib.request.Request(API_BASE + path, data=body, method=method)
    if ctype:
        req.add_header("Content-Type", ctype)
    add_surrogate_to_request(req, CREDENTIAL, entry_name="access_token",
                             allowed_hosts=ALLOWED_HOSTS)
    with urllib.request.urlopen(req, timeout=120) as resp:
        return read_json_response(resp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--script-name", default="lazygig")
    ap.add_argument("--bundle", default="dist/worker.js")
    args = ap.parse_args()

    if not os.path.isfile(args.bundle):
        print(f"error: bundle not found: {args.bundle}", file=sys.stderr)
        return 2
    with open(args.bundle, "rb") as fh:
        script = fh.read()

    accounts = (api("GET", "/accounts").get("result") or [])
    if not accounts:
        print("error: no Cloudflare accounts found", file=sys.stderr)
        return 1
    account_id = accounts[0]["id"]

    # NOTE: the upload API takes bindings as an ARRAY of typed objects
    # (not wrangler.toml's nested form). Workers AI binding: type "ai".
    # KV binding needs the namespace id (created once via the storage API).
    kv_id = os.environ.get("LAZYGIG_KV_ID", "73c93000c5a2419882fb172528e9fc3d")
    bindings = [{"type": "ai", "name": "AI"}]
    if kv_id:
        bindings.append({"type": "kv_namespace", "name": "LAZYGIG_KV",
                         "namespace_id": kv_id})
    metadata = {
        "main_module": os.path.basename(args.bundle),
        "compatibility_date": "2025-01-01",
        "bindings": bindings,
    }

    b = BOUNDARY.encode()
    parts = [
        b"--" + b + b'\r\nContent-Disposition: form-data; name="metadata"\r\n'
        b"Content-Type: application/json\r\n\r\n" + json.dumps(metadata).encode() + b"\r\n",
        b"--" + b + b'\r\nContent-Disposition: form-data; name="script"; filename="'
        + os.path.basename(args.bundle).encode() + b'"\r\nContent-Type: application/javascript+module\r\n\r\n'
        + script + b"\r\n",
        b"--" + b + b"--\r\n",
    ]
    body = b"".join(parts)
    ctype = f"multipart/form-data; boundary={BOUNDARY}"

    data = api("PUT",
               f"/accounts/{account_id}/workers/scripts/{args.script_name}",
               body, ctype)
    if not data.get("success"):
        print(json.dumps(data, indent=2), file=sys.stderr)
        return 1

    # Set the Superteam API key as a Worker secret (server-side only).
    try:
        with open(SUPERTEAM_CREDS) as fh:
            st_key = json.load(fh).get("apiKey") or ""
        if st_key:
            sec = api("PUT",
                      f"/accounts/{account_id}/workers/scripts/{args.script_name}/secrets",
                      json.dumps({"name": "SUPERTEAM_API_KEY", "text": st_key,
                                  "type": "secret_text"}).encode(),
                      "application/json")
            print("superteam secret:", "set" if sec.get("success") else "FAILED")
        else:
            print("superteam secret: no key in creds file, skipped")
    except Exception as exc:
        print(f"warning: secret set failed: {type(exc).__name__}", file=sys.stderr)

    url = None
    try:
        sub = api("POST",
                  f"/accounts/{account_id}/workers/scripts/{args.script_name}/subdomain",
                  b'{"enabled": true}', "application/json")
        if sub.get("success"):
            acct = api("GET", f"/accounts/{account_id}/workers/subdomain")
            sd = (acct.get("result") or {}).get("subdomain")
            url = f"https://{args.script_name}.{sd}.workers.dev" if sd else None
    except Exception as exc:
        print(f"warning: subdomain enable failed: {exc}", file=sys.stderr)

    print(json.dumps({"success": True, "script": args.script_name, "url": url}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
