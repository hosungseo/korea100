#!/usr/bin/env node

/**
 * Minimal-scope X OAuth helper for Korea100.
 *
 * It deliberately requests only the scopes needed to identify @gongpenclaw,
 * publish Posts, and refresh the authorization: tweet.read, tweet.write,
 * users.read, offline.access. App credentials are read locally from xurl's
 * 0600 configuration file; secrets and tokens are never printed.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const APP_NAME = 'korea100-x';
const REDIRECT_URI = 'http://localhost:8080/callback';
const SCOPES = ['tweet.read', 'tweet.write', 'media.write', 'users.read', 'offline.access'];
const XURL_CONFIG = path.join(os.homedir(), '.xurl', 'auth.yml');
const TOKEN_DIR = path.join(os.homedir(), '.config', 'korea100');
const TOKEN_FILE = path.join(TOKEN_DIR, 'x-oauth.json');

function usage() {
  console.log('Usage: node scripts/x_minimal_oauth.mjs <authorize|status|post|post-video> [args]');
}

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
    throw new Error(`No complete ${APP_NAME} credentials found in ${XURL_CONFIG}`);
  }
  if (credentials.redirect_uri && credentials.redirect_uri !== REDIRECT_URI) {
    throw new Error(`Expected ${REDIRECT_URI}; found ${credentials.redirect_uri}`);
  }
  return credentials;
}

function base64url(buffer) {
  return buffer.toString('base64url');
}

function createPkce() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function saveTokens(tokens) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  const payload = {
    ...tokens,
    received_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + Number(tokens.expires_in ?? 7200) * 1000).toISOString(),
  };
  fs.writeFileSync(TOKEN_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(TOKEN_FILE, 0o600);
  return payload;
}

function loadTokens() {
  return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
}

function basicAuthorization(credentials) {
  return `Basic ${Buffer.from(`${credentials.client_id}:${credentials.client_secret}`).toString('base64')}`;
}

async function tokenRequest(credentials, params) {
  const response = await fetch('https://api.x.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: basicAuthorization(credentials),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Token exchange failed (${response.status}): ${body.error_description ?? body.title ?? 'unknown error'}`);
  return body;
}

async function usableTokens(credentials) {
  let tokens = loadTokens();
  const expiresSoon = Date.parse(tokens.expires_at) - Date.now() < 60_000;
  if (!expiresSoon) return tokens;
  if (!tokens.refresh_token) throw new Error('Access token has expired and no refresh token is available. Run authorize again.');
  const refreshed = await tokenRequest(credentials, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  });
  tokens = saveTokens({ ...tokens, ...refreshed, refresh_token: refreshed.refresh_token ?? tokens.refresh_token });
  return tokens;
}

async function authorize() {
  const credentials = readAppCredentials();
  const { verifier, challenge } = createPkce();
  const state = base64url(crypto.randomBytes(32));
  const authUrl = new URL('https://x.com/i/oauth2/authorize');
  authUrl.search = new URLSearchParams({
    response_type: 'code',
    client_id: credentials.client_id,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== '/callback') {
        response.writeHead(404).end();
        return;
      }
      if (url.searchParams.get('state') !== state) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('OAuth state mismatch. You can close this tab.');
        server.close();
        reject(new Error('OAuth state mismatch'));
        return;
      }
      const authorizationCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      if (error || !authorizationCode) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('X authorization failed. You can close this tab.');
        server.close();
        reject(new Error(`X authorization failed: ${error ?? 'no authorization code'}`));
        return;
      }
      try {
        const tokens = await tokenRequest(credentials, {
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        });
        saveTokens(tokens);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>Korea100 X connected</title><p>Korea100 X authorization is complete. You can close this tab.</p>');
        server.close();
        resolve();
      } catch (exchangeError) {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('X authorization could not be completed. You can close this tab.');
        server.close();
        reject(exchangeError);
      }
    });
    server.on('error', reject);
    server.listen(8080, '::', () => console.log('Local callback listener is ready.'));
  });

  await execFileAsync('open', [authUrl.toString()]);
  console.log('Opening X authorization in your default browser…');
  await codePromise;
  console.log('Authorization saved locally with Korea100’s minimal scopes.');
}

async function apiRequest(method, pathname, body) {
  const credentials = readAppCredentials();
  const tokens = await usableTokens(credentials);
  const response = await fetch(`https://api.x.com${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`X API request failed (${response.status}): ${payload.detail ?? payload.title ?? 'unknown error'}`);
  return payload;
}

async function mediaRequest(method, pathname, tokens, body, extraHeaders = {}) {
  const response = await fetch(`https://api.x.com${pathname}`, {
    method,
    headers: { Authorization: `Bearer ${tokens.access_token}`, ...extraHeaders },
    ...(body ? { body } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const problem = payload.detail ?? payload.title ?? payload.errors?.map((error) => error.detail ?? error.message ?? error.title).filter(Boolean).join('; ') ?? 'unknown error';
    throw new Error(`X media request failed (${response.status}): ${problem}`);
  }
  return payload;
}

function multipart(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, String(value));
  return form;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function uploadVideo(videoPath) {
  const absolutePath = path.resolve(videoPath);
  const file = fs.readFileSync(absolutePath);
  const stats = fs.statSync(absolutePath);
  if (!stats.isFile() || file.length === 0) throw new Error(`Video file is unavailable: ${absolutePath}`);

  const credentials = readAppCredentials();
  const tokens = await usableTokens(credentials);
  const init = await mediaRequest('POST', '/2/media/upload/initialize', tokens, JSON.stringify({
    media_type: 'video/mp4',
    total_bytes: file.length,
    media_category: 'tweet_video',
  }), { 'Content-Type': 'application/json' });
  const mediaId = init.data?.id;
  if (!mediaId) throw new Error('X did not return a media ID during upload initialization.');

  const chunkSize = 1024 * 1024;
  for (let offset = 0, segmentIndex = 0; offset < file.length; offset += chunkSize, segmentIndex += 1) {
    const chunk = file.subarray(offset, Math.min(offset + chunkSize, file.length));
    const form = multipart({ segment_index: segmentIndex });
    form.set('media', new Blob([chunk], { type: 'video/mp4' }), path.basename(absolutePath));
    await mediaRequest('POST', `/2/media/upload/${encodeURIComponent(mediaId)}/append`, tokens, form);
  }

  let finalized = await mediaRequest('POST', `/2/media/upload/${encodeURIComponent(mediaId)}/finalize`, tokens);
  for (let attempts = 0; finalized.data?.processing_info && attempts < 20; attempts += 1) {
    const processing = finalized.data.processing_info;
    if (processing.state === 'succeeded') break;
    if (processing.state === 'failed') throw new Error('X video processing failed.');
    await wait(Math.max(1, Math.min(Number(processing.check_after_secs) || 1, 10)) * 1000);
    finalized = await mediaRequest('GET', `/2/media/upload?media_id=${encodeURIComponent(mediaId)}`, tokens);
  }
  if (finalized.data?.processing_info?.state && finalized.data.processing_info.state !== 'succeeded') {
    throw new Error('X video processing did not complete in time.');
  }
  return mediaId;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'authorize') return authorize();
  if (command === 'status') {
    const result = await apiRequest('GET', '/2/users/me?user.fields=description,location,url,profile_image_url');
    console.log(JSON.stringify({
      id: result.data?.id,
      username: result.data?.username,
      name: result.data?.name,
      description: result.data?.description,
      location: result.data?.location,
      url: result.data?.url,
    }, null, 2));
    return;
  }
  if (command === 'post') {
    const text = args.join(' ').trim();
    if (!text) throw new Error('Provide the Post text after the post command.');
    const result = await apiRequest('POST', '/2/tweets', { text });
    console.log(JSON.stringify({ id: result.data?.id, text: result.data?.text }, null, 2));
    return;
  }
  if (command === 'post-video') {
    const [videoPath, ...textParts] = args;
    const text = textParts.join(' ').trim();
    if (!videoPath || !text) throw new Error('Provide a video path and Post text.');
    const mediaId = await uploadVideo(videoPath);
    const result = await apiRequest('POST', '/2/tweets', { text, media: { media_ids: [mediaId] } });
    console.log(JSON.stringify({ id: result.data?.id, text: result.data?.text, media_id: mediaId }, null, 2));
    return;
  }
  usage();
  process.exitCode = 2;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
