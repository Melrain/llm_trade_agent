import { createHmac } from 'crypto'

export function okxPrehash(
  timestamp: string,
  method: 'GET' | 'POST' | 'DELETE',
  requestPath: string,
  body = ''
): string {
  return `${timestamp}${method}${requestPath}${body}`
}

export function signOkxRequest(secret: string, prehash: string): string {
  return createHmac('sha256', secret).update(prehash).digest('base64')
}

export function buildOkxHeaders(input: {
  apiKey: string
  secret: string
  passphrase: string
  timestamp: string
  method: 'GET' | 'POST' | 'DELETE'
  requestPath: string
  body?: string
  demo?: boolean
}): Record<string, string> {
  const body = input.body ?? ''
  const headers: Record<string, string> = {
    'OK-ACCESS-KEY': input.apiKey,
    'OK-ACCESS-SIGN': signOkxRequest(
      input.secret,
      okxPrehash(input.timestamp, input.method, input.requestPath, body)
    ),
    'OK-ACCESS-TIMESTAMP': input.timestamp,
    'OK-ACCESS-PASSPHRASE': input.passphrase,
    'Content-Type': 'application/json'
  }
  if (input.demo) headers['x-simulated-trading'] = '1'
  return headers
}
