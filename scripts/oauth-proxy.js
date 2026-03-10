#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════
//  SCEI GitHub OAuth Proxy — for Decap CMS on the VPS
//
//  Replaces Netlify Identity + Git Gateway.
//  Uses only Node.js built-in modules (no npm install needed).
//
//  SETUP (one-time):
//  ─────────────────
//  1. Create a GitHub OAuth App:
//       → github.com → Settings → Developer settings → OAuth Apps
//       → New OAuth App:
//           Application name:  Sapphire Clinics East CMS
//           Homepage URL:      https://sapphireclinicseast.org
//           Callback URL:      https://sapphireclinicseast.org/oauth/callback
//       → Click "Register application"
//       → Copy the Client ID  (public — goes in admin/config.yml)
//       → Click "Generate a new client secret"
//       → Copy the Client Secret  (PRIVATE — only stored on VPS)
//
//  2. Start the proxy with PM2:
//       GITHUB_CLIENT_ID=YOUR_CLIENT_ID \
//       GITHUB_CLIENT_SECRET=YOUR_CLIENT_SECRET \
//       pm2 start /var/www/sapphireclinicseast.org/scripts/oauth-proxy.js \
//           --name scei-oauth
//       pm2 save
//
//  3. Confirm it's running:  pm2 status
//
//  The proxy listens on 127.0.0.1:3030.
//  Nginx forwards /oauth → http://127.0.0.1:3030 (see scripts/nginx.conf).
// ══════════════════════════════════════════════════════════════════

'use strict';

const http  = require('http');
const https = require('https');
const { parse: parseUrl } = require('url');

// ── Config ───────────────────────────────────────────────────────
const CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const SITE_ORIGIN   = process.env.SITE_ORIGIN || 'https://sapphireclinicseast.org';
const PORT          = 3030;
const CALLBACK_URL  = SITE_ORIGIN + '/oauth/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('');
  console.error('ERROR: Missing environment variables.');
  console.error('  Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET before starting.');
  console.error('  See setup instructions at the top of this file.');
  console.error('');
  process.exit(1);
}

// ── HTTPS POST helper (no extra packages) ────────────────────────
function httpsPost(hostname, path, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname,
        path,
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'SCEI-OAuth-Proxy/1.0',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Request handler ──────────────────────────────────────────────
http.createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url, true);

  // ── Step 1: Redirect browser to GitHub's consent screen ────────
  if (pathname === '/oauth') {
    const params = new URLSearchParams({
      client_id:    CLIENT_ID,
      redirect_uri: CALLBACK_URL,
      scope:        'repo,user',
    });
    res.writeHead(302, {
      Location: 'https://github.com/login/oauth/authorize?' + params,
    });
    return res.end();
  }

  // ── Step 2: Exchange auth code for access token ─────────────────
  if (pathname === '/oauth/callback') {
    const code = query.code;
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing OAuth code. Please try logging in again.');
    }

    let tokenData;
    try {
      tokenData = await httpsPost('github.com', '/login/oauth/access_token', {
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      });
    } catch (err) {
      console.error('GitHub token exchange failed:', err.message);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end('Could not reach GitHub. Please try again.');
    }

    if (tokenData.error || !tokenData.access_token) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end(tokenData.error_description || 'GitHub OAuth failed.');
    }

    // Safely embed token in HTML (escape < > to prevent injection)
    const msg = JSON.stringify({
      token:    tokenData.access_token,
      provider: 'github',
    }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    // Return a popup page that posts the token back to Decap CMS
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`<!DOCTYPE html>
<html><head><title>Authorizing...</title></head>
<body><script>
(function () {
  var msg = 'authorization:github:success:' + ${JSON.stringify(msg)};
  function send(m) { window.opener && window.opener.postMessage(m, '*'); }
  window.addEventListener('message', function handler() {
    send(msg);
    window.removeEventListener('message', handler, false);
  }, false);
  send('authorizing:github');
})();
</script><p>Authorized. You can close this window.</p></body></html>`);
  }

  // ── 404 for anything else ───────────────────────────────────────
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');

}).listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('SCEI OAuth proxy listening on 127.0.0.1:' + PORT);
  console.log('GitHub OAuth App Client ID:', CLIENT_ID.slice(0, 8) + '...');
  console.log('');
});
