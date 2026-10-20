#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('thruput 0.32.2 (test fixture)');
  process.exit(0);
}
appendFileSync(process.env.BOOTSTRAP_TEST_LOG, `${JSON.stringify({ args, cwd: process.cwd(), config: process.env.XDG_CONFIG_HOME })}\n`);
const command = args[2];
const hash = '11111111111111111111111111111112';
let data = { txHash: hash, height: '2', status: { result: 'ok' } };
if (command === 'keys') data = { key: { address: hash } };
if (command === 'config') data = { changed: true };
if (command === 'build') data = { rv32: `${process.cwd()}/fixture.rv32a` };
if (command === 'deploy') data.address = hash;

if (command === 'transfer') {
  if (process.env.BOOTSTRAP_TEST_FAILURE === 'stderr') {
    console.error(JSON.stringify({ ok: false, error: { code: 'transaction_timeout', details: { txHash: hash } } }));
    process.exit(1);
  }
  if (process.env.BOOTSTRAP_TEST_FAILURE === 'reverted') data.status = { result: 'reverted' };
  if (process.env.BOOTSTRAP_TEST_FAILURE === 'unconfirmed') delete data.status;
  if (process.env.BOOTSTRAP_TEST_FAILURE === 'not-ok') {
    console.log(JSON.stringify({ ok: false, error: { message: 'Rejected' } }));
    process.exit(0);
  }
}
console.log(JSON.stringify({ ok: true, data }));
