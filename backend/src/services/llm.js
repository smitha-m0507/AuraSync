import Groq from 'groq-sdk';
import { config } from '../config.js';
import { parseJsonResponse } from './utils/parseJsonResponse.js';

let groqClient = null;
function getGroq() {
  if (!groqClient) {
    // The SDK retries 429/5xx and honours the retry-after header, which matters under TPM limits.
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      maxRetries: config.llm.maxRetries,
      timeout: config.llm.timeoutMs
    });
  }
  return groqClient;
}

async function callGroq({ system, messages, json, tier, maxTokens, temperature, reasoningEffort }) {
  const model = tier === 'fast' ? config.llm.groqFastModel : config.llm.groqModel;
  const params = {
    model,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    temperature,
    max_completion_tokens: maxTokens
  };
  if (json) params.response_format = { type: 'json_object' };
  if (model.startsWith('openai/gpt-oss')) params.reasoning_effort = reasoningEffort;

  const response = await getGroq().chat.completions.create(params);
  return response.choices[0]?.message?.content || '';
}

async function callGoogle({ system, messages, json, maxTokens, temperature }) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: config.llm.googleModel,
    systemInstruction: system || undefined
  });
  const result = await model.generateContent({
    contents: messages.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    })),
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
      ...(json ? { responseMimeType: 'application/json' } : {})
    }
  });
  return result.response.text();
}

async function callTogether({ system, messages, json, maxTokens, temperature }) {
  const response = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.llm.togetherModel,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
      max_tokens: maxTokens,
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {})
    })
  });
  if (!response.ok) {
    throw new Error(`Together AI error: ${response.status} - ${await response.text()}`);
  }
  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

const providers = {
  groq: { name: 'Groq', keyEnv: 'GROQ_API_KEY', call: callGroq },
  google: { name: 'Google Gemini', keyEnv: 'GOOGLE_API_KEY', call: callGoogle },
  together: { name: 'Together AI', keyEnv: 'TOGETHER_API_KEY', call: callTogether }
};

/**
 * Run a chat completion against the first configured provider that succeeds.
 * The full prompt is always sent — callers are responsible for sizing context.
 */
export async function chat({
  system,
  messages,
  json = false,
  tier = 'main',
  maxTokens = 2000,
  temperature = 0.2,
  reasoningEffort = 'low'
}) {
  const errors = [];
  for (const providerName of config.llm.providers) {
    const provider = providers[providerName];
    if (!provider) {
      errors.push(`${providerName}: unknown provider`);
      continue;
    }
    if (!process.env[provider.keyEnv]) {
      errors.push(`${provider.name}: ${provider.keyEnv} not configured`);
      continue;
    }
    try {
      const text = await provider.call({ system, messages, json, tier, maxTokens, temperature, reasoningEffort });
      if (text && text.trim()) return text;
      errors.push(`${provider.name}: empty response`);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }
  throw new Error(`All LLM providers failed: ${errors.join(' | ') || 'none configured'}`);
}

/** Chat completion that must return a JSON object. Retries once if the output is not parseable. */
export async function chatJSON(options, context = 'LLM') {
  const first = await chat({ ...options, json: true });
  try {
    return parseJsonResponse(first, context);
  } catch (error) {
    const retry = await chat({
      ...options,
      json: true,
      messages: [
        ...options.messages,
        { role: 'assistant', content: first.slice(0, 4000) },
        { role: 'user', content: 'That was not valid JSON. Return the complete answer again as one valid JSON object only.' }
      ]
    });
    return parseJsonResponse(retry, context);
  }
}
