#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const prompt = process.argv[process.argv.indexOf('-p') + 1] ?? '';
if (process.env.COMPARE_FAKE_LOG) fs.appendFileSync(process.env.COMPARE_FAKE_LOG, prompt.slice(0, 60).replace(/\n/g, ' ') + '\n');
if (prompt.includes('@@FAIL@@')) { process.stdout.write('not json at all'); process.exit(0); }
const m = prompt.match(/@@FIXTURE:([\w-]+)@@/);
if (m) { process.stdout.write('앞말 ' + fs.readFileSync(path.join(here, 'fixtures', 'claude', m[1] + '.json'), 'utf8') + ' 뒷말'); process.exit(0); }
const e = prompt.indexOf('@@ECHO:');
if (e >= 0) { process.stdout.write(prompt.slice(e + 7)); process.exit(0); }
process.stdout.write('{"error":"no fixture marker"}');
