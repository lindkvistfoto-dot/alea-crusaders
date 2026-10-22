#!/usr/bin/env python3
"""Fail CI when HERMES deliveries remain unprocessed beyond the service threshold."""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

url = os.environ["SUPABASE_URL"].rstrip("/")
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
cutoff = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
params = urllib.parse.urlencode({
    "select": "id,state,created_at,attempts,error_code",
    "state": "in.(queued,failed)",
    "created_at": "lt." + cutoff,
    "limit": "20",
})
req = urllib.request.Request(
    url + "/rest/v1/hermes_web_jobs?" + params,
    headers={"apikey": key, "Authorization": "Bearer " + key},
)
with urllib.request.urlopen(req, timeout=30) as response:
    jobs = json.load(response)
if jobs:
    for job in jobs:
        print("::error::HERMES_STALE_JOB id={} state={} attempts={} created_at={}".format(
            job["id"], job["state"], job["attempts"], job["created_at"]))
    sys.exit(1)
print("HERMES_QUEUE_HEALTHY: no queued/failed deliveries older than 15 minutes")
