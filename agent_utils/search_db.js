#!/usr/bin/env node

import 'dotenv/config'
import process from 'node:process'
import pg from 'pg'

const usage = `Usage: npm run db:query -- --query "SELECT ..." [--format csv|table]

Runs one SQL statement in a read-only transaction using the project .env.`

const parseArguments = (argumentsList) => {
  const options = { format: 'csv', query: null }

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]

    if (argument === '--query' || argument === '-q') {
      options.query = argumentsList[index + 1]
      index += 1
    } else if (argument === '--format' || argument === '-f') {
      options.format = argumentsList[index + 1]
      index += 1
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage)
      process.exit(0)
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }

  if (!options.query) throw new Error('--query is required')
  if (!['csv', 'table'].includes(options.format)) {
    throw new Error('--format must be csv or table')
  }

  return options
}

const formatValue = value => value === null || value === undefined ? '' : String(value)

const escapeCsv = (value) => {
  const text = formatValue(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const printCsv = (fields, rows) => {
  console.log(fields.map(field => escapeCsv(field.name)).join(','))
  for (const row of rows) {
    console.log(fields.map(field => escapeCsv(row[field.name])).join(','))
  }
}

const printTable = (fields, rows) => {
  const headers = fields.map(field => field.name)
  const widths = headers.map((header, index) => Math.max(
    header.length,
    ...rows.map(row => formatValue(row[fields[index].name]).length),
  ))

  const printRow = values => console.log(
    values.map((value, index) => formatValue(value).padEnd(widths[index])).join('  '),
  )

  printRow(headers)
  printRow(widths.map(width => '-'.repeat(width)))
  for (const row of rows) {
    printRow(fields.map(field => row[field.name]))
  }
}

const main = async () => {
  const options = parseArguments(process.argv.slice(2))
  const client = new pg.Client({
    host: process.env.NUXT_DB_HOST,
    user: process.env.NUXT_DB_USER,
    password: process.env.NUXT_DB_PASS,
    database: process.env.NUXT_DB_NAME,
    port: process.env.NUXT_DB_PORT,
  })
  let transactionStarted = false

  try {
    await client.connect()
    await client.query('BEGIN TRANSACTION READ ONLY')
    transactionStarted = true
    const result = await client.query(options.query)

    if (options.format === 'table') printTable(result.fields, result.rows)
    else printCsv(result.fields, result.rows)
  } finally {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
  }
}

main().catch((error) => {
  console.error(`Query error: ${error.message}`)
  process.exitCode = 1
})
