#!/usr/bin/env node
// One-shot helper: hash a new Class Hub main-admin password for the server env.
// The password never leaves this machine; only the hash goes into the env file.
//
// Usage:
//   node scripts/hash-class-portal-admin-password.mjs
//     (prompts twice, input hidden)
//
// Then add the printed line to /opt/sapphire/docker/.env.production and
// recreate the app container. Format: scrypt:<salt>:<key>, both base64url,
// Node's default scrypt cost — must stay in step with src/lib/class-portal-auth.ts.

import { randomBytes, scryptSync } from 'node:crypto'

const MIN_LENGTH = 12

function promptHidden(question) {
  return new Promise(resolve => {
    const stdin = process.stdin
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130) }
        if (ch === '\u007f' || ch === '\b') { value = value.slice(0, -1); continue }
        value += ch
      }
    }
    stdin.on('data', onData)
  })
}

if (!process.stdin.isTTY) {
  console.error('Run this in an interactive terminal (the password is typed at a hidden prompt).')
  process.exit(1)
}

const password = await promptHidden('New Class Hub admin password: ')
if (password.length < MIN_LENGTH) {
  console.error(`Use at least ${MIN_LENGTH} characters.`)
  process.exit(1)
}
if (await promptHidden('Type it again: ') !== password) {
  console.error('The two entries do not match.')
  process.exit(1)
}

const salt = randomBytes(16)
const key = scryptSync(password, salt, 64)
console.log('\nAdd this line to /opt/sapphire/docker/.env.production:\n')
console.log(`CLASS_PORTAL_ADMIN_PASSWORD_HASH=scrypt:${salt.toString('base64url')}:${key.toString('base64url')}`)
