#!/usr/bin/env node
/**
 * Fail a deploy whose migration has not been applied.
 *
 * On 2026-08-22 a PR added three columns to GlCase and shipped an endpoint that
 * selected them. The migration was never run, so /api/accounts-receivable threw
 * P2022 on every request and the whole GL tab read zero — for hours, with the
 * deploy reported green. Prisma has never tracked migrations on this database
 * (there is no _prisma_migrations table), so nothing applies them and nothing
 * notices when they are missing.
 *
 * This does not apply anything. It compares what schema.prisma expects against
 * what the database actually has, and exits non-zero if the code would query a
 * column that is not there — so the deploy stops with a readable message while
 * the previous, working container is still serving.
 *
 * Deliberately narrow: only columns the schema declares and the database lacks.
 * Extra tables and columns in the database are ignored; this repo is full of
 * legacy and backup tables, and failing on those would make the guard noise.
 *
 * Usage: node scripts/check-schema-drift.mjs <path-to-schema.prisma>
 * Env:   DB_CONTAINER (default accounting_db), DB_USER, DB_NAME
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const schemaPath = process.argv[2] ?? 'prisma/schema.prisma'
const container = process.env.DB_CONTAINER ?? 'accounting_db'
const dbUser = process.env.DB_USER ?? 'sapphire'
const dbName = process.env.DB_NAME ?? 'sapphire_accounting'

const SCALARS = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes'])

/** Models and their column names, honouring @map on a field and @@map on a model. */
function parseSchema(src) {
  const models = new Map()
  let model = null, fields = null, tableName = null
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    const open = line.match(/^model\s+(\w+)\s*\{/)
    if (open) { model = open[1]; tableName = model; fields = []; continue }
    if (model && line === '}') { models.set(tableName, fields); model = null; continue }
    if (!model) continue

    const mapTable = line.match(/^@@map\("([^"]+)"\)/)
    if (mapTable) { tableName = mapTable[1]; continue }
    if (line.startsWith('@@') || line.startsWith('//') || !line) continue

    const field = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/)
    if (!field) continue
    const [, name, type, isList] = field
    // Relations and enums are not columns we can check this way. A list of a
    // scalar is a Postgres array and is a real column, so it stays.
    if (!SCALARS.has(type)) continue
    const mapCol = line.match(/@map\("([^"]+)"\)/)
    fields.push(mapCol ? mapCol[1] : name)
  }
  return models
}

function liveColumns() {
  const sql = "SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public';"
  const out = execFileSync('docker', ['exec', container, 'psql', '-U', dbUser, '-d', dbName, '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const map = new Map()
  for (const line of out.split('\n')) {
    const [table, column] = line.trim().split('|')
    if (!table || !column) continue
    if (!map.has(table)) map.set(table, new Set())
    map.get(table).add(column)
  }
  return map
}

const models = parseSchema(readFileSync(schemaPath, 'utf8'))
const live = liveColumns()

const missing = []
for (const [table, columns] of models) {
  if (!live.has(table)) { missing.push(`${table}  <entire table>`); continue }
  for (const column of columns) {
    if (!live.get(table).has(column)) missing.push(`${table}.${column}`)
  }
}

if (missing.length === 0) {
  console.log(`✅ schema matches the database — ${models.size} models checked`)
  process.exit(0)
}

console.error('❌ The database is missing columns this build expects:\n')
for (const m of missing) console.error(`     ${m}`)
console.error(`
   ${missing.length} missing. A migration in this deploy has not been applied.

   Apply it, then re-run the deploy:
     ssh root@<vps> 'docker exec -i ${container} psql -U ${dbUser} -d ${dbName} -v ON_ERROR_STOP=1' \\
       < accounting-hub/prisma/migrations/<the-migration>/migration.sql

   Stopping here so the running container keeps serving. Deploying this build
   would leave every query touching those columns throwing P2022.`)
process.exit(1)
