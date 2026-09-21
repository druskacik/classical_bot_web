import nodemailer from 'nodemailer'
const singleLine = value => typeof value === 'string' && !/[\r\n\x00-\x1f\x7f]/.test(value)
const email = value => singleLine(value) && value.length <= 254 && /^[^\s<>@,;:]+@[^\s<>@,;:]+\.[^\s<>@,;:]+$/.test(value)

export function mailSettings(env = process.env) {
  const port = Number(env.SMTP_PORT || 587)
  const secureValue = env.SMTP_SECURE ?? String(port === 465)
  const from = env.SMTP_FROM?.trim() || 'ClassicalBot'
  const match = from.match(/^([^<>]+)<([^<>]+)>$/)
  const sender = match ? { name: match[1].trim(), address: match[2].trim() }
    : email(from) ? { name: 'ClassicalBot', address: from }
      : { name: from, address: env.SMTP_USER }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !Number.isInteger(port) || port < 1 || port > 65535
    || !['true', 'false'].includes(secureValue) || !singleLine(sender.name) || !email(sender.address)) {
    throw new Error('Invalid SMTP configuration')
  }
  return {
    transport: {
      host: env.SMTP_HOST, port, secure: secureValue === 'true', requireTLS: secureValue === 'false',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      disableFileAccess: true, disableUrlAccess: true,
      logger: false, debug: false,
    },
    from: sender,
  }
}

export async function sendMail(message, env = process.env) {
  const settings = mailSettings(env)
  const transport = nodemailer.createTransport(settings.transport)
  try {
    const result = await transport.sendMail({ ...message, from: settings.from, disableFileAccess: true, disableUrlAccess: true })
    if (!result.accepted?.length || result.rejected?.length) throw Object.assign(new Error('Recipient rejected'), { code: 'EENVELOPE', responseCode: 550 })
    return result
  } finally { transport.close() }
}
