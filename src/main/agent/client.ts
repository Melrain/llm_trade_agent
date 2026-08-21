import { fetchJson } from '../http'

export type ChatResult = {
  content: string
  tokens: { prompt: number; completion: number; total: number } | null
}

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
}

function completionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

export async function chatCompletions(opts: {
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  system: string
  user: string
}): Promise<ChatResult> {
  const body = await fetchJson<ChatCompletionsResponse>(completionsUrl(opts.baseUrl), {
    method: 'POST',
    timeoutMs: 180_000,
    retries: 1,
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      Accept: 'application/json'
    },
    body: {
      model: opts.model,
      temperature: opts.temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user }
      ]
    }
  })

  const content = body.choices?.[0]?.message?.content?.trim() ?? ''
  if (!content) {
    throw new Error('模型返回为空')
  }
  const usage = body.usage
  return {
    content,
    tokens: usage
      ? {
          prompt: usage.prompt_tokens ?? 0,
          completion: usage.completion_tokens ?? 0,
          total: usage.total_tokens ?? 0
        }
      : null
  }
}
