#!/usr/bin/env node
const fs = require('fs');
const a = process.argv.slice(2);
if (a[0] === '--version') { console.log('0.0.1-fake'); process.exit(0); }
if (process.env.FAKE_ARGV_OUT) fs.writeFileSync(process.env.FAKE_ARGV_OUT, JSON.stringify({ argv: a, perm: process.env.OPENCODE_PERMISSION || null }));
console.log('opencode says hi'); console.error('a warning');
