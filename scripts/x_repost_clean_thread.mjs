#!/usr/bin/env node

/**
 * One-shot helper: delete the messy Korea100 EN thread and repost a cleaner version.
 * Secrets never printed.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const APP_NAME = 'korea100-x';
const XURL_CONFIG = path.join(os.homedir(), '.xurl', 'auth.yml');
const TOKEN_FILE = path.join(os.homedir(), '.config/korea100/x-oauth.json');
const VIDEO_PATH = '/Users/seohoseong/hyperframes-test-x-en/renders/hyperframes-test-x-en_2026-07-26_23-31-33.mp4';

// Old messy thread (root + replies)
const OLD_IDS = [
  '2081398777278283916',
  '2081398900741845486',
  '2081398902432079932',
  '2081398904223137891',
  '2081398906316022223',
  '2081398908086026531',
  '2081398911667995112',
  '2081398913597354011',
  '2081398915350552990',
  '2081398917208621303',
  '2081398918974431355',
];

// Keep each part <= 270 for free-tier 280 limit.
const ROOT_TEXT = `Korea100: AI-assisted administrative literacy.

Public systems are dense prose.
We turn them into inspectable maps.`;

const THREAD_PARTS = [
  `Public systems are written as statutes, notices, handbooks, manuals.

To see who does what, when, and where a case gets stuck, you usually decode language — not a system.`,
  `That is a quiet problem.

If people can’t see the structure, they can’t navigate it.
If officials can’t see it, they struggle to explain or improve it.
If AI ignores structure, it gives fluent answers that are hard to own.`,
  `Korea100 starts elsewhere:

AI should help make public systems readable —
not by replacing judgment,
not by hiding process in a chatbot,
but by extracting actors, stages, actions, documents, bottlenecks.`,
  `Method:
1) start from the real procedure text
2) map who acts and where decisions branch
3) surface gates, returns, documents
4) present one inspectable system model

Clearer public systems — not prettier diagrams.`,
];

function yamlScalar(raw) {
  const value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function readAppCredentials() {
  const text = fs.readFileSync(XURL_CONFIG, 'utf8');
  const lines = text.split(/\r?\n/);
  let inApp = false;
  const credentials = {};
  for (const line of lines) {
    if (line === `    ${APP_NAME}:`) {
      inApp = true;
      continue;
    }
    if (inApp && /^    [^\s].*:$/.test(line)) break;
    if (!inApp) continue;
    const match = line.match(/^        (client_id|client_secret|redirect_uri):\s*(.+)$/);
    if (match) credentials[match[1]] = yamlScalar(match[2]);
  }
  if (!credentials.client_id || !credentials.client_secret) {
    throw new Error(`No complete ${APP_NAME} credentials found`);
  }
  return credentials;
}

function saveTokens(tokens) {
  const payload = {
    ...tokens,
    received_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 7200) * 1000).toISOString(),
  };
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(TOKEN_FILE, 0o600);
  return payload;
}

async function tokenRequest(credentials, params) {
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Token exchange failed (${response.status})`);
  return body;
}

async function usableTokens(credentials) {
  let tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const expiresSoon = Date.parse(tokens.expires_at) - Date.now() < 60_000;
  if (!expiresSoon) return tokens;
  if (!tokens.refresh_token) throw new Error('Access token expired and no refresh token available');
  const refreshed = await tokenRequest(credentials, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  return saveTokens({ ...tokens, ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token });
}

async function api(method, urlPath, tokens, body, headers = {}) {
  const response = await fetch(`https://api.x.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
  const json = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, json };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadVideo(tokens, videoPath) {
  const absolutePath = path.resolve(videoPath);
  const file = fs.readFileSync(absolutePath);
  const init = await api('POST', '/2/media/upload/initialize', tokens, JSON.stringify({
    media_type: 'video/mp4',
    total_bytes: file.length,
    media_category: 'tweet_video',
  }), { 'Content-Type': 'application/json' });
  if (!init.ok) throw new Error(`media init failed (${init.status}): ${JSON.stringify(init.json)}`);
  const mediaId = init.json?.data?.id;
  if (!mediaId) throw new Error('No media id');

  const chunkSize = 1024 * 1024;
  for (let offset = 0, segmentIndex = 0; offset < file.length; offset += chunkSize, segmentIndex += 1) {
    const chunk = file.subarray(offset, Math.min(offset + chunkSize, file.length));
    const form = new FormData();
    form.set('segment_index', String(segmentIndex));
    form.set('media', new Blob([chunk], { type: 'video/mp4' }), path.basename(absolutePath));
    const appended = await api('POST', `/2/media/upload/${encodeURIComponent(mediaId)}/append`, tokens, form);
    if (!appended.ok) throw new Error(`media append failed (${appended.status})`);
  }

  let finalized = await api('POST', `/2/media/upload/${encodeURIComponent(mediaId)}/finalize`, tokens);
  if (!finalized.ok) throw new Error(`media finalize failed (${finalized.status})`);
  for (let attempts = 0; finalized.json?.data?.processing_info && attempts < 30; attempts += 1) {
    const processing = finalized.json.data.processing_info;
    if (processing.state === 'succeeded') break;
    if (processing.state === 'failed') throw new Error('video processing failed');
    await wait(Math.max(1, Math.min(Number(processing.check_after_secs) || 1, 10)) * 1000);
    finalized = await api('GET', `/2/media/upload?media_id=${encodeURIComponent(mediaId)}`, tokens);
  }
  if (finalized.json?.data?.processing_info?.state && finalized.json.data.processing_info.state !== 'succeeded') {
    throw new Error('video processing timeout');
  }
  return mediaId;
}

function assertLimits() {
  const all = [ROOT_TEXT, ...THREAD_PARTS];
  for (const [i, text] of all.entries()) {
    if (text.length > 270) {
      throw new Error(`Part ${i} too long: ${text.length}`);
    }
  }
}

async function main() {
  assertLimits();
  const credentials = readAppCredentials();
  const tokens = await usableTokens(credentials);

  const deleted = [];
  for (const id of OLD_IDS) {
    const result = await api('DELETE', `/2/tweets/${id}`, tokens);
    deleted.push({ id, status: result.status, ok: result.ok });
  }

  const mediaId = await uploadVideo(tokens, VIDEO_PATH);
  const root = await api('POST', '/2/tweets', tokens, JSON.stringify({
    text: ROOT_TEXT,
    media: { media_ids: [mediaId] },
  }), { 'Content-Type': 'application/json' });
  if (!root.ok) throw new Error(`root post failed (${root.status}): ${JSON.stringify(root.json)}`);

  const ids = [root.json.data.id];
  let prev = root.json.data.id;
  for (const text of THREAD_PARTS) {
    const part = await api('POST', '/2/tweets', tokens, JSON.stringify({
      text,
      reply: { in_reply_to_tweet_id: prev },
    }), { 'Content-Type': 'application/json' });
    if (!part.ok) throw new Error(`thread part failed (${part.status}): ${JSON.stringify(part.json)}`);
    prev = part.json.data.id;
    ids.push(prev);
  }

  console.log(JSON.stringify({
    deleted,
    root_id: ids[0],
    thread_ids: ids,
    url: `https://x.com/gongpenclaw/status/${ids[0]}`,
    lengths: [ROOT_TEXT, ...THREAD_PARTS].map((t) => t.length),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
