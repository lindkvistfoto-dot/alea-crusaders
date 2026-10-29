#!/usr/bin/env python3
"""Copy live Supabase Storage into the empty development project.

Database queries are read-only except for creating missing Storage RLS policies
in the target project. Bucket and object operations use the Storage API. This
script never updates or deletes objects, buckets, or source-project data.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

SOURCE_REF = "wbmosmkirsitkonejzpg"
TARGET_REF = "wkiuyklzzroavclnsxna"
SOURCE_URL = f"https://{SOURCE_REF}.supabase.co"
TARGET_URL = f"https://{TARGET_REF}.supabase.co"
CONFIRM_TEXT = "COPY LIVE STORAGE TO DEV"
TIMEOUT_SECONDS = 120
OWNER_UUID = re.compile(r"^[0-9a-fA-F-]{36}$")

OBJECTS_SQL = r"""
SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json)::text
FROM (
  SELECT bucket_id, name, owner_id, COALESCE((metadata->>'size')::bigint, 0) AS size_bytes,
         metadata->>'mimetype' AS mimetype,
         metadata->>'cacheControl' AS cache_control
  FROM storage.objects
  ORDER BY bucket_id, name
) x
"""
POLICIES_SQL = r"""
SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json)::text
FROM (
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'storage'
  ORDER BY tablename, policyname
) x
"""


def stop(code):
    raise RuntimeError(code)


def request_bytes(url, method, api_key, bearer=None, body=None, content_type=None, cache_control=None, extra_headers=None):
    headers = {"apikey": api_key}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    if content_type:
        headers["Content-Type"] = content_type
    if cache_control:
        headers["Cache-Control"] = cache_control
    if extra_headers:
        headers.update(extra_headers)
    data = body
    if method in {"POST", "PUT", "PATCH"} and data is None:
        data = b""
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError("SUPABASE_HTTP_" + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError("SUPABASE_NETWORK_ERROR") from None


def request_json(url, method, api_key, bearer=None, payload=None):
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    raw = request_bytes(
        url, method, api_key, bearer=bearer, body=body,
        content_type="application/json" if body is not None else None,
    )
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        stop("SUPABASE_INVALID_JSON_RESPONSE")


def psql(database_url, sql, input_sql=None):
    args = [
        "psql", "--no-psqlrc", "--quiet", "--tuples-only", "--no-align",
        "--set=ON_ERROR_STOP=1", "--dbname", database_url,
    ]
    if input_sql is None:
        args += ["--command", sql]
    try:
        result = subprocess.run(
            args, input=input_sql, capture_output=True, text=True, check=False, timeout=180
        )
    except (OSError, subprocess.TimeoutExpired):
        stop("DATABASE_CLIENT_FAILED")
    if result.returncode != 0:
        # Deliberately omit psql output because it can include project details.
        stop("DATABASE_OPERATION_FAILED")
    return result.stdout.strip()


def psql_json(database_url, sql):
    raw = psql(database_url, sql)
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError:
        stop("DATABASE_JSON_RESPONSE_INVALID")
    if not isinstance(value, list):
        stop("DATABASE_RESPONSE_SHAPE_INVALID")
    return value


def validate_db_url(database_url, project_ref):
    parsed = urllib.parse.urlparse(database_url)
    username = urllib.parse.unquote(parsed.username or "")
    direct_host = f"db.{project_ref}.supabase.co"
    direct = parsed.hostname == direct_host
    pooler = (
        bool(parsed.hostname)
        and parsed.hostname.endswith(".pooler.supabase.com")
        and username == f"postgres.{project_ref}"
    )
    if parsed.scheme not in {"postgres", "postgresql"} or not (direct or pooler):
        stop("DATABASE_PROJECT_REF_MISMATCH")


def api_key(name):
    value = os.environ.get(name, "")
    if not value:
        stop("MISSING_REQUIRED_GITHUB_SECRET")
    return value


def normalize_bucket(row):
    return {
        "id": row.get("id") or row.get("name"),
        "name": row.get("name") or row.get("id"),
        "public": bool(row.get("public")),
        "file_size_limit": row.get("file_size_limit"),
        "allowed_mime_types": sorted(row.get("allowed_mime_types") or []),
    }


def bucket_list(base_url, key):
    rows = request_json(base_url + "/storage/v1/bucket", "GET", key, bearer=key)
    if not isinstance(rows, list):
        stop("BUCKET_LIST_RESPONSE_INVALID")
    normalized = [normalize_bucket(row) for row in rows]
    if any(not item["id"] or not item["name"] for item in normalized):
        stop("BUCKET_METADATA_INVALID")
    return {item["id"]: item for item in normalized}


def object_key(row):
    return (row["bucket_id"], row["name"])


def normalize_objects(rows):
    normalized = {}
    for row in rows:
        bucket_id = row.get("bucket_id")
        name = row.get("name")
        if not isinstance(bucket_id, str) or not isinstance(name, str) or not name:
            stop("OBJECT_METADATA_INVALID")
        owner_id = row.get("owner_id")
        if owner_id is not None and not OWNER_UUID.fullmatch(str(owner_id)):
            stop("OBJECT_OWNER_ID_INVALID")
        cache_control = row.get("cache_control")
        if cache_control is not None:
            cache_control = str(cache_control).strip()
            if cache_control.isdigit():
                cache_control = "max-age=" + cache_control
        item = {
            "bucket_id": bucket_id,
            "name": name,
            "owner_id": str(owner_id) if owner_id is not None else None,
            "size_bytes": int(row.get("size_bytes") or 0),
            "mimetype": row.get("mimetype"),
            "cache_control": cache_control,
        }
        normalized[object_key(item)] = item
    if len(normalized) != len(rows):
        stop("DUPLICATE_OBJECT_METADATA")
    return normalized


def policy_key(row):
    return (row["schemaname"], row["tablename"], row["policyname"])


def normalize_policies(rows):
    normalized = {}
    for row in rows:
        if row.get("schemaname") != "storage" or row.get("tablename") != "objects":
            stop("UNEXPECTED_STORAGE_POLICY_TABLE")
        roles = row.get("roles") or []
        normalized[policy_key(row)] = {
            "schemaname": row["schemaname"],
            "tablename": row["tablename"],
            "policyname": row["policyname"],
            "permissive": row["permissive"],
            "roles": sorted(roles),
            "cmd": row["cmd"],
            "qual": row.get("qual"),
            "with_check": row.get("with_check"),
        }
    if len(normalized) != len(rows):
        stop("DUPLICATE_STORAGE_POLICY")
    return normalized


def quote_ident(value):
    return '"' + str(value).replace('"', '""') + '"'


def policy_ddl(row):
    roles = row["roles"]
    if not roles:
        stop("STORAGE_POLICY_WITHOUT_ROLES")
    sql = (
        "CREATE POLICY " + quote_ident(row["policyname"])
        + " ON " + quote_ident("storage") + "." + quote_ident("objects")
        + " AS " + row["permissive"]
        + " FOR " + row["cmd"]
        + " TO " + ", ".join(quote_ident(role) for role in roles)
    )
    if row["qual"] is not None:
        sql += " USING (" + row["qual"] + ")"
    if row["with_check"] is not None:
        sql += " WITH CHECK (" + row["with_check"] + ")"
    return sql + ";"


def storage_url(base_url, bucket_id, path, route):
    bucket = urllib.parse.quote(bucket_id, safe="")
    object_path = "/".join(urllib.parse.quote(part, safe="") for part in path.split("/"))
    prefix = route + "/" if route else ""
    return base_url + "/storage/v1/object/" + prefix + bucket + "/" + object_path


def download_object(base_url, key, row):
    return request_bytes(
        storage_url(base_url, row["bucket_id"], row["name"], "authenticated"),
        "GET", key, bearer=key,
    )


def list_auth_users(target_database_url, owner_ids):
    if not owner_ids:
        return {}
    ids = ", ".join("'" + owner_id + "'::uuid" for owner_id in sorted(owner_ids))
    sql = f"""
    SELECT COALESCE(json_agg(row_to_json(x)), '[]'::json)::text
    FROM (
      SELECT u.id::text AS id, u.email, COALESCE(p.is_admin, false) AS is_admin
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      WHERE u.id = ANY(ARRAY[{ids}])
      ORDER BY u.id
    ) x
    """
    rows = psql_json(target_database_url, sql)
    users = {row["id"]: row for row in rows}
    if set(users) != owner_ids:
        stop("TARGET_OWNER_USER_MISSING")
    if any(not row.get("email") or not row.get("is_admin") for row in users.values()):
        stop("OWNED_OBJECT_OWNER_NOT_ADMIN_OR_EMAIL_MISSING")
    return users


def create_owner_session(target_url, target_key, owner_id, email):
    response = request_json(
        target_url + "/auth/v1/admin/generate_link",
        "POST", target_key, bearer=target_key,
        payload={"type": "magiclink", "email": email},
    )
    properties = response.get("properties", response) if isinstance(response, dict) else {}
    token_hash = properties.get("hashed_token") or properties.get("token_hash")
    if not token_hash:
        stop("OWNER_MAGIC_LINK_TOKEN_MISSING")
    session = request_json(
        target_url + "/auth/v1/verify",
        "POST", target_key,
        payload={"token_hash": token_hash, "type": "email"},
    )
    if not isinstance(session, dict) or not session.get("access_token"):
        stop("OWNER_AUTH_SESSION_FAILED")
    actual_user_id = (session.get("user") or {}).get("id")
    if str(actual_user_id) != owner_id:
        stop("OWNER_AUTH_SESSION_MISMATCH")
    return session["access_token"]


def sign_out_owner(target_url, target_key, access_token):
    try:
        request_bytes(
            target_url + "/auth/v1/logout?scope=local", "POST",
            target_key, bearer=access_token, body=b"", content_type="application/json",
        )
    except RuntimeError:
        # The access token is runner-local and expires normally; don't leak it.
        print("Notice: a temporary development auth session could not be signed out.")


def target_object_auth(owner_id, target_key, owner_sessions):
    return owner_sessions.get(owner_id) if owner_id else target_key


def upload_object(target_url, target_key, row, data, bearer):
    if row["mimetype"] and not isinstance(row["mimetype"], str):
        stop("OBJECT_MIMETYPE_INVALID")
    cache_control = None
    if row["cache_control"] not in (None, ""):
        cache_value = str(row["cache_control"]).strip()
        if cache_value.isdigit():
            cache_control = "max-age=" + cache_value
        elif cache_value == "no-cache" or re.fullmatch(r"max-age=\d+", cache_value):
            cache_control = cache_value
        else:
            stop("OBJECT_CACHE_CONTROL_INVALID")
    request_bytes(
        storage_url(target_url, row["bucket_id"], row["name"], ""),
        "POST", target_key, bearer=bearer, body=data,
        content_type=row["mimetype"] or "application/octet-stream",
        cache_control=cache_control,
        extra_headers={"x-upsert": "false"},
    )


def ensure_policies(target_db_url, source_policies, target_policies):
    for key, row in target_policies.items():
        if key not in source_policies or row != source_policies[key]:
            stop("TARGET_STORAGE_POLICY_CONFLICT")
    missing = [source_policies[key] for key in sorted(source_policies) if key not in target_policies]
    if missing:
        statements = ["BEGIN;"] + [policy_ddl(row) for row in missing] + ["COMMIT;"]
        psql(target_db_url, "", input_sql="\n".join(statements) + "\n")
    return len(missing)


def ensure_buckets(target_url, target_key, source_buckets, target_buckets):
    if any(bucket_id not in source_buckets for bucket_id in target_buckets):
        stop("TARGET_HAS_EXTRA_BUCKETS")
    created = 0
    for bucket_id in sorted(source_buckets):
        source = source_buckets[bucket_id]
        existing = target_buckets.get(bucket_id)
        if existing:
            if existing != source:
                stop("TARGET_BUCKET_CONFIGURATION_CONFLICT")
            continue
        payload = {
            "id": source["id"],
            "name": source["name"],
            "public": source["public"],
            "file_size_limit": source["file_size_limit"],
            "allowed_mime_types": source["allowed_mime_types"] or None,
        }
        request_json(
            target_url + "/storage/v1/bucket",
            "POST", target_key, bearer=target_key, payload=payload,
        )
        created += 1
    return created


def run():
    if os.environ.get("COPY_CONFIRMATION") != CONFIRM_TEXT:
        stop("COPY_CONFIRMATION_MISMATCH")

    source_storage_key = api_key("SOURCE_STORAGE_SERVICE_ROLE_KEY")
    target_storage_key = api_key("TARGET_STORAGE_SERVICE_ROLE_KEY")
    source_db_url = api_key("SOURCE_DATABASE_URL")
    target_db_url = api_key("TARGET_DATABASE_URL")
    validate_db_url(source_db_url, SOURCE_REF)
    validate_db_url(target_db_url, TARGET_REF)
    if source_db_url == target_db_url:
        stop("SOURCE_AND_TARGET_DATABASES_MATCH")

    # Read-only inventory and complete preflight before any target writes.
    source_buckets = bucket_list(SOURCE_URL, source_storage_key)
    target_buckets = bucket_list(TARGET_URL, target_storage_key)
    source_objects = normalize_objects(psql_json(source_db_url, OBJECTS_SQL))
    target_objects = normalize_objects(psql_json(target_db_url, OBJECTS_SQL))
    source_policies = normalize_policies(psql_json(source_db_url, POLICIES_SQL))
    target_policies = normalize_policies(psql_json(target_db_url, POLICIES_SQL))

    if len(source_buckets) != 19 or len(source_objects) == 0:
        stop("LIVE_STORAGE_INVENTORY_UNEXPECTED")
    if any(row["bucket_id"] not in source_buckets for row in source_objects.values()):
        stop("LIVE_OBJECT_BUCKET_MISSING")
    if any(key not in source_objects for key in target_objects):
        stop("TARGET_HAS_EXTRA_OBJECTS")
    if any(
        target_objects[key]["size_bytes"] != source_objects[key]["size_bytes"]
        or target_objects[key]["owner_id"] != source_objects[key]["owner_id"]
        for key in target_objects
    ):
        stop("TARGET_OBJECT_METADATA_CONFLICT")
    owner_ids = {row["owner_id"] for row in source_objects.values() if row["owner_id"]}
    users = list_auth_users(target_db_url, owner_ids)

    # Check a partial run's objects byte-for-byte before resuming.
    for key, target_row in target_objects.items():
        source_row = source_objects[key]
        source_bytes = download_object(SOURCE_URL, source_storage_key, source_row)
        target_bytes = download_object(TARGET_URL, target_storage_key, target_row)
        if hashlib.sha256(source_bytes).digest() != hashlib.sha256(target_bytes).digest():
            stop("TARGET_OBJECT_CONTENT_CONFLICT")

    created_buckets = ensure_buckets(TARGET_URL, target_storage_key, source_buckets, target_buckets)
    created_policies = ensure_policies(target_db_url, source_policies, target_policies)

    owner_sessions = {}
    copied = 0
    skipped = 0
    total_bytes = 0
    try:
        for index, key in enumerate(sorted(source_objects), start=1):
            row = source_objects[key]
            source_bytes = download_object(SOURCE_URL, source_storage_key, row)
            if len(source_bytes) != row["size_bytes"]:
                stop("SOURCE_OBJECT_SIZE_MISMATCH")
            expected_hash = hashlib.sha256(source_bytes).digest()
            existing = target_objects.get(key)
            if existing:
                # Recheck immediately before skip; never overwrite an existing object.
                target_bytes = download_object(TARGET_URL, target_storage_key, existing)
                if hashlib.sha256(target_bytes).digest() != expected_hash:
                    stop("TARGET_OBJECT_CONTENT_CONFLICT")
                skipped += 1
                total_bytes += len(source_bytes)
                continue

            owner_id = row["owner_id"]
            if owner_id and owner_id not in owner_sessions:
                owner_sessions[owner_id] = create_owner_session(
                    TARGET_URL, target_storage_key, owner_id, users[owner_id]["email"]
                )
            bearer = target_object_auth(owner_id, target_storage_key, owner_sessions)
            upload_object(TARGET_URL, target_storage_key, row, source_bytes, bearer)
            target_bytes = download_object(TARGET_URL, target_storage_key, row)
            if hashlib.sha256(target_bytes).digest() != expected_hash:
                stop("UPLOADED_OBJECT_CHECKSUM_MISMATCH")
            copied += 1
            total_bytes += len(source_bytes)
            if index % 100 == 0:
                print("Processed object batch:", index)

        for owner_id, access_token in owner_sessions.items():
            sign_out_owner(TARGET_URL, target_storage_key, access_token)
        owner_sessions.clear()
    finally:
        for access_token in owner_sessions.values():
            sign_out_owner(TARGET_URL, target_storage_key, access_token)

    # Final metadata parity check. This queries Storage metadata only; no direct
    # writes to storage.objects are made.
    final_source = normalize_objects(psql_json(source_db_url, OBJECTS_SQL))
    final_target = normalize_objects(psql_json(target_db_url, OBJECTS_SQL))
    if final_source != source_objects or final_target != source_objects:
        stop("FINAL_STORAGE_METADATA_MISMATCH")
    final_buckets = bucket_list(TARGET_URL, target_storage_key)
    if final_buckets != source_buckets:
        stop("FINAL_BUCKET_CONFIGURATION_MISMATCH")
    final_policies = normalize_policies(psql_json(target_db_url, POLICIES_SQL))
    if final_policies != source_policies:
        stop("FINAL_STORAGE_POLICY_MISMATCH")

    summary = {
        "source_project": SOURCE_REF,
        "target_project": TARGET_REF,
        "bucket_count": len(source_buckets),
        "object_count": len(source_objects),
        "bytes_verified": total_bytes,
        "objects_uploaded_this_run": copied,
        "objects_already_present_and_verified": skipped,
        "owner_accounts_used": len(owner_ids),
        "storage_policies": len(source_policies),
        "result": "verified",
    }
    print("Storage copy verified:", json.dumps(summary, sort_keys=True))
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
        output.write("## Supabase Storage copy to development\n\n")
        output.write("- Result: verified\n")
        output.write(f"- Buckets: {summary['bucket_count']}\n")
        output.write(f"- Objects: {summary['object_count']}\n")
        output.write(f"- Bytes verified: {summary['bytes_verified']}\n")
        output.write(f"- Objects uploaded this run: {copied}\n")
        output.write(f"- Existing objects verified: {skipped}\n")
        output.write(f"- Storage RLS policies: {summary['storage_policies']}\n")


if __name__ == "__main__":
    try:
        run()
    except RuntimeError as error:
        print("::error::" + str(error), file=sys.stderr)
        sys.exit(1)
