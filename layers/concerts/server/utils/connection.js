import knex from 'knex'
import dotenv from 'dotenv'

dotenv.config({ quiet: true })

export default knex({
  client: 'pg',
  connection: {
    host: process.env.NUXT_DB_HOST,
    user: process.env.NUXT_DB_USER,
    password: process.env.NUXT_DB_PASS,
    database: process.env.NUXT_DB_NAME,
    port: process.env.NUXT_DB_PORT,
    application_name: 'classical-bot-web',
  },
  pool: {
    min: 0,
    max: 10,
  },
})
