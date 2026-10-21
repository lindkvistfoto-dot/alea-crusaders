#!/usr/bin/env python3
"""Narrow HERMES metadata client: verified Inbox originals -> Drive trash, never delete.

The existing publisher still uses drive.readonly. This client requires a separate
short-lived HERMES token with drive.metadata. No user-identity fallback is allowed.
Conditional updates MUST be proven with an isolated probe before enabling writes.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request

INBOX = '1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp'
ACCOUNT = 'hermes-transfer@alea-hermes.iam.gserviceaccount.com'
SCOPE = 'https://www.googleapis.com/auth/drive.metadata'
ROOT = 'https://www.googleapis.com/drive/v3'
FIELDS = 'id,name,mimeType,parents,trashed,explicitlyTrashed,headRevisionId,properties,capabilities(canTrash)'
ID = re.compile(r'^[A-Za-z0-9_-]{10,160}$')
REVISION = re.compile(r'^[A-Za-z0-9_-]{1,200}$')


def require(condition, error):
    if not condition:
        raise ValueError(error)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('CLEANUP_REDIRECT_REJECTED')


class InboxTrash:
    def __init__(self, token=None, *, conditional_verified=None, enabled=False):
        self.token = token if token is not None else os.environ.get('HERMES_CLEANUP_ACCESS_TOKEN', '')
        self.conditional_verified = conditional_verified if conditional_verified is not None else (
            os.environ.get('HERMES_CLEANUP_CONDITIONAL_VERIFIED') == 'true')
        self.opener = urllib.request.build_opener(NoRedirect())
        self.enabled = enabled

    def request(self, path, *, method='GET', payload=None, etag=None):
        require(bool(self.token), 'HERMES_CLEANUP_CREDENTIALS_MISSING')
        require(method in ('GET', 'PATCH'), 'CLEANUP_METHOD_FORBIDDEN')
        headers = {'Authorization': 'Bearer ' + self.token, 'Accept': 'application/json'}
        body = None
        if payload is not None:
            body = json.dumps(payload, separators=(',', ':')).encode()
            headers['Content-Type'] = 'application/json'
        if etag:
            headers['If-Match'] = etag
        req = urllib.request.Request(ROOT + path, method=method, headers=headers, data=body)
        try:
            with self.opener.open(req, timeout=40) as response:
                data = response.read(65537)
                require(len(data) <= 65536, 'CLEANUP_RESPONSE_TOO_LARGE')
                return json.loads(data), response.headers.get('ETag')
        except urllib.error.HTTPError as error:
            if error.code == 412:
                raise ValueError('DRIVE_REVISION_CONFLICT') from None
            raise ValueError('DRIVE_CLEANUP_HTTP_' + str(error.code)) from None

    def identity(self):
        about, _ = self.request('/about?fields=user(emailAddress)')
        require(about.get('user', {}).get('emailAddress') == ACCOUNT, 'WRONG_CLEANUP_IDENTITY')

    def metadata(self, file_id):
        require(isinstance(file_id, str) and ID.fullmatch(file_id), 'INVALID_CLEANUP_FILE_ID')
        return self.request('/files/' + file_id + '?' + urllib.parse.urlencode(dict(fields=FIELDS)))

    def trash(self, file_id, revision, intent):
        require(self.enabled is True, 'CLEANUP_WRITES_NOT_AUTHORIZED')
        require(isinstance(file_id, str) and ID.fullmatch(file_id), 'INVALID_CLEANUP_FILE_ID')
        require(isinstance(revision, str) and REVISION.fullmatch(revision), 'PINNED_SOURCE_REVISION_REQUIRED')
        require(isinstance(intent, str) and re.fullmatch(r'[a-f0-9]{64}', intent), 'CLEANUP_INTENT_REQUIRED')
        self.identity()
        meta, etag = self.metadata(file_id)
        require(meta.get('id') == file_id and meta.get('parents') == [INBOX], 'CLEANUP_OUTSIDE_INBOX')
        require(meta.get('mimeType') == 'image/png', 'CLEANUP_PNG_ORIGINAL_ONLY')
        require(meta.get('headRevisionId') == revision, 'SOURCE_REVISION_CHANGED')
        marker = meta.get('properties', {}).get('hermesCleanup')
        if meta.get('trashed'):
            # A persisted intent + matching marker reconciles a lost PATCH response.
            require(meta.get('explicitlyTrashed') is True and marker == intent, 'TRASHED_BY_OTHER_OPERATION')
        else:
            require(meta.get('trashed') is False, 'TRASH_STATE_UNVERIFIED')
            require(meta.get('capabilities', {}).get('canTrash') is True, 'HERMES_CANNOT_TRASH_FILE')
            require(self.conditional_verified is True, 'CONDITIONAL_TRASH_NOT_LIVE_VERIFIED')
            require(isinstance(etag, str) and re.fullmatch(r'"[^"\r\n]+"', etag), 'DRIVE_STRONG_ETAG_REQUIRED')
            self.request('/files/' + file_id + '?' + urllib.parse.urlencode(dict(fields=FIELDS)),
                         method='PATCH', etag=etag,
                         payload={'trashed': True, 'properties': {**meta.get('properties', {}), 'hermesCleanup': intent}})
            meta, _ = self.metadata(file_id)
        require(meta.get('id') == file_id and meta.get('headRevisionId') == revision
                and meta.get('parents') == [INBOX]
                and meta.get('trashed') is True and meta.get('explicitlyTrashed') is True
                and meta.get('properties', {}).get('hermesCleanup') == intent, 'TRASH_READBACK_FAILED')
        return dict(file_id=file_id, source_revision=revision, intent=intent, trashed=True,
                    identity=ACCOUNT, scope=SCOPE)
