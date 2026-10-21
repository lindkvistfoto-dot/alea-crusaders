#!/usr/bin/env python3
"""Permission-only probe, exclusively for the two committed synthetic objects. No publication."""
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

from hermes4_drive_trash import InboxTrash, INBOX, ROOT, ACCOUNT, require
from hermes_drive_intake import api


def snapshot(client, folders):
    result = []
    for folder in sorted(set(folders)):
        page = None
        seen = set()
        while True:
            query = dict(q="'" + folder + "' in parents", pageSize=1000,
                         fields='nextPageToken,incompleteSearch,files(id,version,trashed,headRevisionId)')
            if page:
                query['pageToken'] = page
            data, _ = client.request('/files?' + urlencode(query))
            require(not data.get('incompleteSearch'), 'ARCHIVE_SNAPSHOT_INCOMPLETE')
            result.extend(dict(folder=folder, **f) for f in data['files'])
            page = data.get('nextPageToken')
            if not page:
                break
            require(page not in seen, 'ARCHIVE_PAGINATION_LOOP')
            seen.add(page)
    return hashlib.sha256(json.dumps(sorted(result, key=lambda r: (r['folder'], r['id'])), sort_keys=True).encode()).hexdigest()


def probe(fixture):
    require(fixture['synthetic_only'] is True, 'SYNTHETIC_PROBE_ONLY')
    report = dict(identity=ACCOUNT, production_publications=0, permanent_deletions=0,
                  inbox_file_id=fixture['inbox_file_id'], outside_file_id=fixture['outside_file_id'], success=False)
    before = None
    client = InboxTrash(enabled=True)
    try:
        client.identity()  # Requires the actual HERMES token; never substitute the connected owner.
        config = json.loads((Path(__file__).resolve().parents[1] / 'config/hermes-drive-folders.json').read_text())
        folders = [config['folders']['original_archive'], *config['archive_categories'].values(),
                   *config['spell_types'].values(), *config['skill_types'].values()]
        before = snapshot(client, folders)
        outside, _ = client.metadata(fixture['outside_file_id'])
        require(outside['name'] == fixture['outside_name'] and not outside['trashed'], 'OUTSIDE_PROBE_CHANGED')
        try:
            client.trash(outside['id'], outside['headRevisionId'], 'f' * 64)
        except ValueError as error:
            require(str(error) == 'CLEANUP_OUTSIDE_INBOX', 'OUTSIDE_GUARD_NOT_PROVEN')
            report['outside_rejected'] = True
        else:
            raise ValueError('OUTSIDE_GUARD_FAILED')
        meta, etag = client.metadata(fixture['inbox_file_id'])
        require(meta['name'] == fixture['inbox_name'] and meta['parents'] == [INBOX]
                and meta['mimeType'] == 'image/png' and meta['trashed'] is False, 'INBOX_PROBE_CHANGED')
        require(bool(os.environ.get('GOOGLE_ACCESS_TOKEN')), 'HERMES_READ_TOKEN_MISSING')
        _, data = api(ROOT + '/about?fields=user(emailAddress)', os.environ['GOOGLE_ACCESS_TOKEN'])
        require(json.loads(data)['user']['emailAddress'] == ACCOUNT, 'WRONG_READ_IDENTITY')
        _, raw = api(ROOT + '/files/' + meta['id'] + '?alt=media', os.environ['GOOGLE_ACCESS_TOKEN'])
        require(hashlib.sha256(raw).hexdigest() == fixture['source_sha256'], 'PROBE_SOURCE_CHANGED')
        report['hermes_read'] = True
        require(meta.get('capabilities', {}).get('canTrash') is True, 'HERMES_CANNOT_TRASH_FILE')
        require(bool(etag), 'DRIVE_STRONG_ETAG_REQUIRED')
        # Only this allowlisted synthetic object is used to test server-side CAS.
        # If If-Match is ignored, the empty PATCH cannot trash or replace its bytes.
        try:
            client.request('/files/' + meta['id'] + '?fields=id', method='PATCH', payload={},
                           etag='"hermes-deliberately-invalid-etag"')
        except ValueError as error:
            require(str(error) == 'DRIVE_REVISION_CONFLICT', 'CONDITIONAL_TRASH_NOT_LIVE_VERIFIED')
        else:
            raise ValueError('CONDITIONAL_TRASH_NOT_LIVE_VERIFIED')
        client.conditional_verified = True
        client.trash(meta['id'], meta['headRevisionId'], fixture['source_sha256'])
        report['hermes_trash'] = True
        listing, _ = client.request('/files?' + urlencode(dict(q="'" + INBOX + "' in parents and trashed = false",
                                                               pageSize=1000, fields='nextPageToken,files(id)')))
        require(not listing.get('nextPageToken') and meta['id'] not in [f['id'] for f in listing['files']],
                'PROBE_STILL_VISIBLE_OR_LIST_INCOMPLETE')
        report['not_in_live_inbox'] = True
        report['conditional_update_verified'] = True
    except Exception as error:
        report['error'] = str(error) if isinstance(error, ValueError) else 'PROBE_EXTERNAL_FAILURE'
    finally:
        if before is not None:
            try:
                report['archive_unchanged'] = before == snapshot(client, folders)
            except Exception:
                report['archive_unchanged'] = False
        report['success'] = all(report.get(k) is True for k in ('outside_rejected', 'hermes_read', 'hermes_trash',
                                                                'not_in_live_inbox', 'archive_unchanged',
                                                                'conditional_update_verified'))
    return report


if __name__ == '__main__':
    fixture = json.loads((Path(__file__).resolve().parents[1] / 'hermes/fixtures/trash-probe.json').read_text())
    report = probe(fixture)
    destination = Path(sys.argv[1])
    destination.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    raise SystemExit(0 if report['success'] else 1)
