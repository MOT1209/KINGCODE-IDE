#!/usr/bin/env node
'use strict';
/* Usage: node bridge/cli.js [--port 7878] [--workspace <dir>] [--origin <url>]... */
const { createBridge, VERSION } = require('./server');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const origins = args.flatMap((a, i) => a === '--origin' ? [args[i + 1]] : []);
(async () => {
  const port = +opt('port', process.env.KINGCODE_PORT || 7878);
  const b = createBridge({ origins });
  const addr = await b.listen(port, '127.0.0.1');
  const wsDir = opt('workspace');
  if (wsDir) await b.workspace.open(wsDir);
  console.log(`King Bridge ${VERSION} listening on http://127.0.0.1:${addr.port}`);
  console.log(`Token file: ${require('path').join(require('./lib/util').home(), 'token')}`);
  console.log('Paste the token in kingCode → Dev panel → Connect. Never share it.');
  const stop = () => b.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch(e => { console.error('Failed to start:', e.message); process.exit(1); });
