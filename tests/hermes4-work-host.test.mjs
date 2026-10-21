import {it, expect, vi} from 'vitest';
import {hermes4WorkTick} from '../scripts/hermes4_work_host.mjs';

const line = value => JSON.stringify(value) + '\n';
const request = (name, args={}) => line({tool:'mcp__codex_apps__'+name, arguments:args});
const finished = {output:line({result:{reports:[],errors:[]}}),exit_code:0};

it('uses connected tools and waits through fragmented frames and slow verification',async()=>{
  const read=request('google_drive_list_folder',{url:'folder'});
  const tools={exec_command:vi.fn(async()=>({output:read.slice(0,30),session_id:1})),
    write_stdin:vi.fn().mockResolvedValueOnce({output:read.slice(30),session_id:1})
      .mockResolvedValueOnce({output:'',session_id:1}).mockResolvedValueOnce(finished),
    mcp__codex_apps__google_drive_list_folder:vi.fn(async()=>({structuredContent:{files:[]}}))};
  expect(await hermes4WorkTick(tools)).toEqual({reports:[],errors:[]});
  expect(tools.mcp__codex_apps__google_drive_list_folder).toHaveBeenCalledWith({url:'folder'});
  expect(tools.write_stdin.mock.calls[1][0].chars).toBe(line({structuredContent:{files:[]},isError:false}));
});

it('denies all writes by default and never calls an arbitrary tool',async()=>{
  for(const name of ['github_create_file','google_drive_delete_file','untrusted']){
    const tools={exec_command:async()=>({output:request(name),session_id:1}),write_stdin:vi.fn(async()=>finished)};
    await expect(hermes4WorkTick(tools)).rejects.toThrow('WORK_WRITE_OR_TOOL_NOT_AUTHORIZED');
    expect(tools.write_stdin).toHaveBeenCalledWith(expect.objectContaining({chars:'\x03'}));
  }
});

it('materializes both Sediment forms without forwarding bearer URLs and removes local bytes',async()=>{
  for(const prefix of ['', 'sediment://']){
    const tools={exec_command:vi.fn(async args=>args.cmd.startsWith('python -u')?
      {output:request('google_drive_fetch'),session_id:1}:{output:'',exit_code:0}),
      write_stdin:vi.fn(async()=>finished),download_file:vi.fn(async()=>({path:'/workspace/attachments/test/original.png'})),
      mcp__codex_apps__google_drive_fetch:async()=>({structuredContent:{file_uri:{file_id:prefix+'file_123',download_url:'https://secret'}}})};
    await hermes4WorkTick(tools);
    expect(tools.download_file).toHaveBeenCalledWith({file_id:'file_123'});
    const response=JSON.parse(tools.write_stdin.mock.calls[0][0].chars);
    expect(response).toEqual({structuredContent:{workspace_path:'/workspace/attachments/test/original.png'},isError:false});
    expect(tools.exec_command.mock.calls[1][0].cmd).toContain('unlink(missing_ok=True)');
  }
});

it('returns a sanitized provider failure and preserves its own error when the child has exited',async()=>{
  const tools={exec_command:async()=>({output:request('google_drive_fetch'),session_id:1}),
    write_stdin:vi.fn().mockResolvedValueOnce({output:'Traceback: stopped\n',exit_code:1}).mockRejectedValueOnce(Error('Unknown process')),
    mcp__codex_apps__google_drive_fetch:async()=>{throw Error('Bearer secret')}};
  await expect(hermes4WorkTick(tools)).rejects.toThrow('WORK_RPC_PROTOCOL_ERROR');
  expect(tools.write_stdin.mock.calls[0][0].chars).toBe(line({isError:true}));
});

it('passes direct trash authorization only when writes are explicitly enabled',async()=>{
  for(const allowWrites of [false,true]){
    const tools={exec_command:vi.fn(async()=>finished)};
    await hermes4WorkTick(tools,{allowWrites});
    expect(tools.exec_command.mock.calls[0][0].cmd.includes('--allow-trash')).toBe(allowWrites);
  }
});
