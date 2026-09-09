// OpenRouter AI service — uses OpenRouter API (openai-compatible)

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.NVIDIA_API_KEY || '';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5'; // Claude Sonnet 4.5 via OpenRouter

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  tools?: any[];
}

export async function checkVllmStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<{ text: string, tool_calls?: any[] }> {
  const { maxTokens = 512, temperature = 0.7, systemPrompt, tools } = options;

  const fullMessages: ChatMessage[] = [];
  if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
  fullMessages.push(...messages);

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://atrail.in',
      'X-Title': 'Atrail',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: fullMessages,
      max_tokens: maxTokens,
      temperature,
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI API error: ${response.status} — ${error}`);
  }

  const data = await response.json() as any;
  const message = data.choices?.[0]?.message;
  return {
    text: message?.content?.trim() ?? '',
    tool_calls: message?.tool_calls
  };
}

export async function summarizeText(text: string): Promise<string> {
  const res = await chat(
    [{ role: 'user', content: `Summarize the following in concise bullet points:\n\n${text}` }],
    {
      maxTokens: 300,
      temperature: 0.3,
      systemPrompt: 'You are a professional business assistant. Be concise and clear.',
    }
  );
  return res.text;
}

export async function summarizeWithMistral(text: string): Promise<string> {
  const res = await chat(
    [
      { role: 'system', content: 'You are an expert document analyzer. Summarize the OCR text concisely, highlighting key entities, action items, and main ideas.' },
      { role: 'user', content: text },
    ],
    { maxTokens: 400, temperature: 0.3 }
  );
  return res.text;
}

export async function getTaskHelp(taskTitle: string, taskDescription: string): Promise<string> {
  const res = await chat(
    [{ role: 'user', content: `Task: "${taskTitle}"\nDescription: ${taskDescription}\n\nProvide clear, numbered steps to complete this task.` }],
    {
      maxTokens: 400,
      temperature: 0.5,
      systemPrompt: 'You are a professional project management assistant. Be practical and concise.',
    }
  );
  return res.text;
}
