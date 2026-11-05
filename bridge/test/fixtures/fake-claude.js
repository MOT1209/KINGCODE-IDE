#!/usr/bin/env node
// Fake "claude" CLI: records its argv and emits stream-json events like the real one.
const fs = require('fs');
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('9.9.9 (Fake Claude Code)'); process.exit(0); }
if (process.env.FAKE_ARGV_OUT) fs.writeFileSync(process.env.FAKE_ARGV_OUT, JSON.stringify({ argv: a, perm: process.env.OPENCODE_PERMISSION || null }));
if (a.includes('hang')) { setInterval(() => {}, 1000); console.log(JSON.stringify({ type: 'system', subtype: 'init' })); }
else {
  console.log(JSON.stringify({ type: 'system', subtype: 'init' }));
  console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } }));
  console.log(JSON.stringify({ type: 'result', subtype: 'success', result: 'done!', total_cost_usd: 0.0123, usage: { input_tokens: 10, output_tokens: 5 } }));
}
