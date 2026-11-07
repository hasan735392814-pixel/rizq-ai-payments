import { useState, type FormEvent } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { callFunction, ApiError } from '@/lib/functions';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { inputClassName } from '@/components/ui/Field';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  'Which invoices are overdue and who should I follow up with?',
  'How much have I verified from PayPal this month?',
  'Draft a polite reminder for an unpaid invoice.',
];

export function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setQuestion('');
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const { answer } = await callFunction<{ answer: string }>('/ai/business-assistant', {
        method: 'POST',
        body: { question: trimmed },
      });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', text: answer }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The assistant is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <>
      <PageHeader title="Business assistant" description="Ask about your invoices, payments and collections. The assistant answers from your own records." />

      <Card className="flex min-h-[460px] flex-col" padded={false}>
        <div className="flex-1 space-y-4 overflow-y-auto p-6" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-navy-500">Try one of these questions:</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void ask(suggestion)}
                    className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-left text-sm text-navy-700 transition-all duration-200 hover:-translate-y-px hover:border-emerald-300 hover:shadow-card"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 animate-fade-up ${message.role === 'user' ? 'justify-end' : ''}`}>
              {message.role === 'assistant' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Bot className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user' ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-800'
                }`}
              >
                {message.text}
              </div>
              {message.role === 'user' && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-100 text-navy-600">
                  <User className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
            </div>
          ))}
          {loading && <p className="text-sm text-navy-500" role="status">The assistant is thinking…</p>}
          {error && <Alert tone="error">{error}</Alert>}
        </div>

        <form onSubmit={submit} className="flex gap-3 border-t border-navy-100 p-4">
          <label htmlFor="assistant-question" className="sr-only">Ask the assistant</label>
          <input
            id="assistant-question"
            className={inputClassName}
            value={question}
            maxLength={500}
            placeholder="Ask about your invoices or payments"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" variant="accent" loading={loading} disabled={!question.trim()} icon={<Send className="h-4 w-4" aria-hidden="true" />}>
            Ask
          </Button>
        </form>
      </Card>
    </>
  );
}
