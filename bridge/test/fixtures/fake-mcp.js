// Minimal MCP stdio server used by tests (newline-delimited JSON-RPC).
let buf = '';
process.stdin.on('data', d => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === 'initialize') send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-03-26', serverInfo: { name: 'fake-mcp', version: '0.0.1' }, capabilities: { tools: {} } } });
    else if (m.method === 'tools/list') { console.error('listing tools'); send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo', description: 'Echo text' }, { name: 'sum', description: 'Add numbers' }] } }); }
  }
});
function send(o) { process.stdout.write(JSON.stringify(o) + '\n'); }
