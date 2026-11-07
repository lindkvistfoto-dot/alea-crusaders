#!/usr/bin/env python3
"""Watch scheduled HERMES ALEA cleanup heartbeats and raise durable OLYMPIA alerts."""
import json
import os
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode
from urllib.request import Request, urlopen

SUPA=os.environ["SUPABASE_URL"].rstrip("/")
KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ENV=os.environ.get("OLYMPIA_ENVIRONMENT","DEV").upper()
BASE={"apikey":KEY,"Authorization":"Bearer "+KEY,"Content-Type":"application/json","Prefer":"return=representation"}

def rest(path,method="GET",payload=None):
    body=json.dumps(payload).encode() if payload is not None else None
    req=Request(SUPA+"/rest/v1/"+path,body=body,headers=BASE,method=method)
    with urlopen(req,timeout=30) as response:
        raw=response.read()
    return json.loads(raw) if raw else []

def rpc(name,payload):
    return rest("rpc/"+name,"POST",payload)

def parse_time(value):
    return datetime.fromisoformat(value.replace("Z","+00:00")).astimezone(timezone.utc)

def main():
    if ENV not in ("DEV","LIVE"):
        raise ValueError("OLYMPIA_ENVIRONMENT_INVALID")
    query=urlencode({"environment":"eq."+ENV,"system":"eq.HERMES ALEA","component":"eq.cleanup",
                     "select":"status,last_started_at,last_finished_at,last_success_at,error_code,summary"})
    rows=rest("olympia_system_health?"+query)
    now=datetime.now(timezone.utc)
    row=rows[0] if rows else None
    stale=not row or not row.get("last_success_at") or now-parse_time(row["last_success_at"])>timedelta(minutes=30)
    failed=row and row.get("status")=="failure" and (not row.get("last_success_at") or parse_time(row["last_finished_at"])>parse_time(row["last_success_at"]))
    key="hermes-alea:"+ENV.lower()+":cleanup-schedule"
    if stale or failed:
        code="CLEANUP_SCHEDULE_MISSED" if stale else (row.get("error_code") or "CLEANUP_RUN_FAILED")
        detail="HERMES ALEA cleanup has not completed successfully within 30 minutes." if stale else "The latest HERMES ALEA cleanup run failed."
        rpc("olympia_system_alert_upsert",{"payload":{
            "alert_key":key,"environment":ENV,"system":"HERMES ALEA","component":"scheduled cleanup",
            "severity":"critical","error_code":code,"description":detail,
            "affected":{"last_finished_at":row.get("last_finished_at") if row else None,
                        "last_success_at":row.get("last_success_at") if row else None},
            "recommended_action":"Open OLYMPIA, inspect the latest HERMES ALEA workflow run, repair its credentials or cleanup error, then rerun it."
        }})
        print("OLYMPIA_CLEANUP_ALERT",ENV,code)
    else:
        rpc("olympia_system_alert_resolve",{"alert_key":key})
        print("OLYMPIA_CLEANUP_HEALTHY",ENV,row.get("last_success_at"))

if __name__=="__main__":
    main()
