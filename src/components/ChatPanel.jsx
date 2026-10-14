import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { jobsAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext';

function suggestionsFrom(summary, speakers) {
  const items = ['Give me a summary of this audio'];
  if (speakers?.length > 1) items.push(`What did each of the ${speakers.length} speakers contribute?`);
  items.push('What numbers or metrics were mentioned?', 'What decisions or action items came up?');
  for (const tag of (summary?.tags || []).slice(0, 2)) items.push(`What was said about ${tag}?`);
  return items;
}

/** Chat with the recording. History is persisted server-side on the job. */
export default function ChatPanel({ jobId, summary, speakers, initialHistory = [], onHistoryChange }) {
  const { addToast } = useToast();
  const [messages, setMessages] = useState(initialHistory);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  useEffect(() => {
    onHistoryChange?.(messages);
  }, [messages, onHistoryChange]);

  const ask = async (question) => {
    const text = question.trim();
    if (!text || sending) return;
    if (!jobId) {
      addToast('This report is not linked to a processed recording, so it cannot answer new questions.', 'error');
      return;
    }
    setInput('');
    setMessages((current) => [...current, { role: 'user', content: text, createdAt: new Date().toISOString() }]);
    setSending(true);
    try {
      const response = await jobsAPI.chat(jobId, text);
      setMessages((current) => [...current, response.data.data.message]);
    } catch (error) {
      const message = error.response?.data?.error?.message || error.message;
      setMessages((current) => [...current, { role: 'assistant', content: `⚠ ${message}`, error: true }]);
    } finally {
      setSending(false);
    }
  };

  const clear = async () => {
    try {
      if (jobId) await jobsAPI.clearChat(jobId);
      setMessages([]);
    } catch (error) {
      addToast('Could not clear the conversation.', 'error');
    }
  };

  return (
    <div className="flex h-[640px] flex-col rounded-3xl border border-border bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="font-display text-xl font-bold text-text-primary">Ask the recording</h3>
          <p className="text-xs text-text-secondary">Answers come only from this audio, with [mm:ss] timestamps.</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-text-secondary transition hover:text-text-primary">
            Clear chat
          </button>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {messages.length === 0 && (
          <div className="text-center">
            <p className="text-text-secondary">Ask anything about the recording. Try:</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestionsFrom(summary, speakers).map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => ask(suggestion)}
                  className="rounded-full border border-border bg-bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-aura-cyan"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-aura-violet to-aura-cyan text-white'
                  : message.error
                    ? 'border border-border bg-bg-elevated text-error'
                    : 'border border-border bg-bg-elevated text-text-primary'
              }`}
            >
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-bg-elevated px-4 py-3 text-sm text-text-secondary">
              <span className="animate-pulse">Reading the recording…</span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="flex gap-3 border-t border-border p-4"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question about the audio…"
          maxLength={2000}
          className="input flex-1"
          disabled={sending}
          aria-label="Question about the audio"
        />
        <button type="submit" disabled={sending || !input.trim()} className="gradient-button disabled:cursor-not-allowed disabled:opacity-60">
          Send
        </button>
      </form>
    </div>
  );
}
