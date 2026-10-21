/**
 * Work tool-host transport. Inject the session's tools object; no OAuth tokens leave it.
 * This function performs one tick. A persistent, authorized host must schedule future ticks.
 * It does not install a daemon, grant permissions, or enable production processing.
 */
const reads = new Set([
  'google_drive_get_file_metadata', 'google_drive_search', 'google_drive_list_folder', 'google_drive_fetch',
  'google_drive_list_file_revisions',
  'github_fetch', 'github_download_workflow_artifact',
]);
const writes = new Set([
  'google_drive_copy_file', 'google_drive_update_file', 'google_drive_upload_file',
  'google_drive_share_file',
  'github_create_file',
]);
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";

export async function hermes4WorkTick(tools, {
  repo = '/workspace/alea-crusaders', ledger = '/workspace/hermes4-state/ledger.db',
  allowWrites = false, maxCalls = 5000,
} = {}) {
  const downloads = new Set();
  let session;
  let completed = false;
  let pending = '';
  try {
    let chunk = await tools.exec_command({
      cmd: `python -u scripts/hermes4_work.py --ledger ${quote(ledger)}${allowWrites ? ' --allow-trash' : ''}`,
      workdir: repo, tty: true, yield_time_ms: 1000, max_output_tokens: 40000,
    });
    session = chunk.session_id;
    for (let count = 0; count < maxCalls; count++) {
      pending += chunk.output;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      const messages = lines.filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      const result = messages.find(message => 'result' in message);
      if (result) {
        completed = true;
        return result.result;
      }
      const requests = messages.filter(message => message.tool);
      if (!requests.length && session && chunk.exit_code === undefined) {
        chunk = await tools.write_stdin({session_id: session, chars: '', yield_time_ms: 1000, max_output_tokens: 40000});
        continue;
      }
      if (requests.length !== 1 || !session) throw Error('WORK_RPC_PROTOCOL_ERROR');
      const {tool, arguments: args} = requests[0];
      const name = tool.replace(/^mcp__codex_apps__/, '');
      if (!reads.has(name) && !(allowWrites && writes.has(name))) throw Error('WORK_WRITE_OR_TOOL_NOT_AUTHORIZED');
      if (typeof tools[tool] !== 'function') throw Error('REQUIRED_CONNECTED_TOOL_UNAVAILABLE');
      let response;
      try {
        const raw = await tools[tool](args);
        const value = raw.structuredContent ?? raw;
        // Binary connectors return Sediment-backed references. Materialize through
        // the authenticated download tool, never follow the embedded signed URL.
        const file = value.file_uri;
        const fileId = typeof file?.file_id === 'string' ? file.file_id.replace(/^sediment:\/\//, '') : '';
        if (file && typeof file === 'object' && /^file_[a-zA-Z0-9]+$/.test(fileId)) {
          const saved = await tools.download_file({file_id: fileId});
          const downloaded = typeof saved === 'string' ? JSON.parse(saved) : saved;
          if (!downloaded.path?.startsWith('/workspace/attachments/') && !downloaded.path?.startsWith('/tmp/')) {
            throw Error('UNEXPECTED_MATERIALIZATION_PATH');
          }
          downloads.add(downloaded.path);
          response = {structuredContent: {workspace_path: downloaded.path}, isError: false};
        } else {
          response = {structuredContent: value, isError: !!raw.isError};
        }
      } catch {
        response = {isError: true}; // No credential-bearing provider error in the transcript or ledger.
      }
      chunk = await tools.write_stdin({session_id: session, chars: JSON.stringify(response) + '\n',
                                      yield_time_ms: 1000, max_output_tokens: 40000});
    }
    throw Error('WORK_TICK_CALL_LIMIT');
  } finally {
    if (session && !completed) {
      // The durable intent/checkpoints reconcile the interrupted operation on the next tick.
      try {
        await tools.write_stdin({session_id: session, chars: '\x03', yield_time_ms: 1000, max_output_tokens: 1000});
      } catch { /* The child may already have exited after a rejected provider response. */ }
    }
    if (downloads.size) {
      await tools.exec_command({cmd: 'python -c ' + quote('import pathlib,sys; [pathlib.Path(p).unlink(missing_ok=True) for p in sys.argv[1:]]')
                                + ' ' + [...downloads].map(quote).join(' '), max_output_tokens: 1000});
    }
  }
}
