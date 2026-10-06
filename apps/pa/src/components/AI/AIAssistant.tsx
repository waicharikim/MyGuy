import React, { useEffect, useRef, useState } from 'react';
import { Bot, Link2, Loader2, LogOut, Mic, MicOff, Send, User } from 'lucide-react';
import {
  PaConversationMessage,
  PaLinkRequest,
  shauriApi,
} from '../../services/shauri';

type ConversationMessage = PaConversationMessage & { localOnly?: boolean };
type AssistantStatus = 'loading' | 'unlinked' | 'linked';

const greeting: ConversationMessage = {
  id: 'welcome',
  type: 'ai',
  message: 'Hi, I’m Shauri. Bring me a decision you’re working through, and we can clarify it, examine risks, and work toward a grounded next step.',
  timestamp: new Date().toISOString(),
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
};

type SpeechRecognitionWindow = Window & {
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const AIAssistant: React.FC = () => {
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<AssistantStatus>('loading');
  const [linkRequest, setLinkRequest] = useState<PaLinkRequest | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([greeting]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    shauriApi.session()
      .then(({ linked }) => {
        if (active) setStatus(linked ? 'linked' : 'unlinked');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setStatus('unlinked');
        setError(reason instanceof Error ? reason.message : 'Could not check your Shauri link.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!linkRequest || status !== 'unlinked') return;
    let active = true;
    const checkLink = async () => {
      try {
        const result = await shauriApi.linkStatus();
        if (!active) return;
        if (result.state === 'linked') {
          setLinkRequest(null);
          setError('');
          setStatus('linked');
        } else if (result.state === 'expired' || result.state === 'not_started') {
          setLinkRequest(null);
          setError('That link expired. Request a new code to continue.');
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not check the link status.');
      }
    };
    const timer = window.setInterval(() => { void checkLink(); }, 2000);
    void checkLink();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [linkRequest, status]);

  useEffect(() => {
    if (!activeThreadId || status !== 'linked') return;
    let active = true;
    const syncMessages = async () => {
      try {
        const result = await shauriApi.threadMessages(activeThreadId);
        if (!active) return;
        setConversation((current) => {
          const localMessages = current.filter((localMessage) =>
            localMessage.localOnly &&
            !result.messages.some((storedMessage) =>
              storedMessage.type === localMessage.type &&
              storedMessage.message === localMessage.message &&
              Math.abs(
                new Date(storedMessage.timestamp).getTime() -
                new Date(localMessage.timestamp).getTime(),
              ) < 60_000,
            ),
          );
          return [
            ...(result.messages.length ? [] : [greeting]),
            ...result.messages,
            ...localMessages,
          ].sort((left, right) =>
            new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
          );
        });
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Could not refresh this decision.');
      }
    };
    const timer = window.setInterval(() => { void syncMessages(); }, 5000);
    void syncMessages();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [activeThreadId, status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, status]);

  const startLink = async () => {
    setError('');
    setLinkRequest(null);
    try {
      const result = await shauriApi.createLink();
      setLinkRequest(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start account linking.');
    }
  };

  const handleSendMessage = async () => {
    const text = message.trim();
    if (!text || isSending || status !== 'linked') return;
    setMessage('');
    setError('');
    setIsSending(true);
    setConversation((current) => [...current, {
      id: `local-user-${crypto.randomUUID()}`,
      type: 'user',
      message: text,
      timestamp: new Date().toISOString(),
      localOnly: true,
    }]);
    try {
      const result = await shauriApi.sendMessage(text);
      setConversation((current) => [...current, {
        id: `local-ai-${crypto.randomUUID()}`,
        type: 'ai',
        message: result.reply,
        timestamp: new Date().toISOString(),
        localOnly: true,
      }]);
      if (result.threadId) setActiveThreadId(result.threadId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Shauri could not process that message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    setError('');
    try {
      await shauriApi.logout();
      setStatus('unlinked');
      setConversation([greeting]);
      setActiveThreadId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not end the linked session.');
    }
  };

  const startVoiceRecognition = () => {
    const browserWindow = window as SpeechRecognitionWindow;
    if (!browserWindow.webkitSpeechRecognition) {
      setError('Voice input is not supported by this browser.');
      return;
    }
    const recognition = new browserWindow.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onerror = () => {
      setIsListening(false);
      setError('Voice input could not be started. You can type your message instead.');
    };
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event) => setMessage(event.results[0][0].transcript);
    recognition.start();
  };

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Checking your secure Shauri link…
      </div>
    );
  }

  if (status === 'unlinked') {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Link2 className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Link PA to Shauri</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Link with the WhatsApp account you already use with Shauri. Your PA tasks,
          notes, finance, health and calendar data stay in PA and are not sent to Shauri.
          Messages here use your linked Shauri decision history.
        </p>
        {linkRequest ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-5 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Send this one-time command to your Shauri WhatsApp chat:
            </p>
            <code className="mt-3 block break-all rounded-lg bg-white px-4 py-3 text-lg font-semibold tracking-wide text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
              {linkRequest.command}
            </code>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Expires {new Date(linkRequest.expiresAt).toLocaleTimeString()}. This code can be used once.
            </p>
          </div>
        ) : (
          <button
            onClick={() => { void startLink(); }}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <Link2 className="h-4 w-4" /> Start secure linking
          </button>
        )}
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex min-h-[65vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">Shauri decision assistant</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Securely linked to your WhatsApp account</p>
        </div>
        <button
          onClick={() => { void handleLogout(); }}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          aria-label="Unlink Shauri"
        >
          <LogOut className="h-4 w-4" /><span className="hidden sm:inline">Unlink</span>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {conversation.map((item) => (
          <div key={item.id} className={`flex ${item.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 lg:max-w-2xl ${
              item.type === 'user'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-900 dark:bg-slate-700 dark:text-white'
            }`}>
              <div className="mb-1 flex items-center gap-2 text-xs opacity-75">
                {item.type === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                <span>{item.type === 'user' ? 'You' : 'Shauri'}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{item.message}</p>
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Shauri is working through this…
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}
      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          PA’s local personal data is not shared with Shauri. For help requiring a person, Shauri may follow up in WhatsApp.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              maxLength={4000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void handleSendMessage();
                }
              }}
              placeholder="Bring a decision you’re working through…"
              disabled={isSending}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
            />
            <button
              onClick={startVoiceRecognition}
              className={`absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 ${
                isListening ? 'text-red-500' : 'text-slate-400 hover:text-slate-600'
              }`}
              aria-label={isListening ? 'Listening' : 'Use voice input'}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={() => { void handleSendMessage(); }}
            disabled={!message.trim() || isSending}
            className="rounded-lg bg-emerald-600 p-3 text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message to Shauri"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;
