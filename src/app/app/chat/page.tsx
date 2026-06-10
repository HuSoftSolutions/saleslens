"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Send,
  User,
  Sparkles,
  Plus,
  Check,
  Copy,
  MessageSquare,
} from "lucide-react";
import { getIdToken } from "@/lib/firebase/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoMark } from "@/components/brand";
import { Markdown } from "@/components/markdown";
import { ChatChart, type ChartData } from "@/components/chat-chart";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
  chart?: ChartData | null;
  createdAt?: string;
}
interface ThreadMeta {
  id: string;
  title: string;
  updatedAt: string | null;
}
interface Location {
  id: string;
  name: string;
}

const SUGGESTIONS = [
  "What were my total sales today?",
  "What are my top selling items this week?",
  "How do this week's sales compare to last week?",
  "What hours am I busiest?",
];

const FOLLOW_UPS = [
  "Compare to last week",
  "Compare to last month",
  "Compare to last year",
  "Compare to the same period last year",
  "Break it down by location",
  "Show me the busiest hours",
];

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round(
    (startOfDay(Date.now()) - startOfDay(new Date(iso).getTime())) / 86_400_000
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString();
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [scope, setScope] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const id = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading]);

  const loadThreads = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch("/api/chat/threads", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setThreads((await res.json()).threads ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; setState happens after await (not a synchronous cascade).
    /* eslint-disable react-hooks/set-state-in-effect */
    loadThreads();
    (async () => {
      try {
        const token = await getIdToken();
        if (!token) return;
        const res = await fetch("/api/analytics/locations", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setLocations((await res.json()).locations ?? []);
      } catch {
        /* ignore */
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [loadThreads]);

  const handleSend = useCallback(
    async (textArg?: string) => {
      const trimmed = (textArg ?? input).trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput("");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, createdAt: new Date().toISOString() },
      ]);
      setLoading(true);

      try {
        const token = await getIdToken();
        if (!token) {
          setError("Not authenticated. Please sign in again.");
          setLoading(false);
          return;
        }
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            threadId: threadId ?? undefined,
            message: trimmed,
            location: scope || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status})`);
        }
        const data = await res.json();
        setThreadId(data.threadId);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.answer,
            chart: data.chart ?? null,
            createdAt: new Date().toISOString(),
          },
        ]);
        loadThreads();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [input, loading, threadId, scope, loadThreads]
  );

  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSentRef.current) {
      autoSentRef.current = true;
      handleSend(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function openThread(id: string) {
    if (id === threadId) return;
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) return;
      const res = await fetch(`/api/chat/threads/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
      setThreadId(id);
    } catch {
      /* ignore */
    }
  }

  function newChat() {
    setMessages([]);
    setThreadId(null);
    setError(null);
    setInput("");
  }

  async function copy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1500);
    } catch {
      /* ignore */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const isEmpty = messages.length === 0 && !loading;
  const showFollowUps =
    !loading && messages.length > 0 && messages[messages.length - 1].role === "assistant";

  return (
    <div className="flex h-[calc(100vh-9rem)] gap-4">
      {/* Thread history */}
      <aside className="hidden w-56 shrink-0 flex-col gap-2 md:flex">
        <Button variant="outline" size="sm" onClick={newChat} className="justify-start">
          <Plus className="size-4" />
          New chat
        </Button>
        <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {threads.map((t) => (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              className={cn(
                "flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
                t.id === threadId
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-2 text-sm",
                  t.id === threadId ? "text-accent-foreground" : "text-foreground"
                )}
              >
                <MessageSquare className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">{t.title}</span>
              </span>
              <span className="pl-[1.375rem] text-[11px] text-muted-foreground">
                {relativeTime(t.updatedAt)}
              </span>
            </button>
          ))}
          {threads.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              No conversations yet.
            </p>
          )}
        </div>
      </aside>

      {/* Main chat column */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Chat</h1>
            <p className="truncate text-sm text-muted-foreground">
              Ask questions about your Clover business data
            </p>
          </div>
          <div className="flex items-center gap-2">
            {locations.length > 0 && (
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
                title="Scope questions to a location"
              >
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={newChat}
              className="md:hidden"
            >
              <Plus className="size-4" />
              New
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
            <div className="mx-auto max-w-3xl p-4">
              {isEmpty ? (
                <div className="flex flex-col items-center justify-center gap-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <LogoMark className="size-11" />
                    <div>
                      <p className="text-sm font-medium">Ask about your business</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Sales, top items, busy hours, refunds, and more.
                      </p>
                    </div>
                  </div>
                  <div className="grid w-full max-w-md gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSend(s)}
                        className="group flex items-center gap-2.5 rounded-lg border border-border bg-background px-3.5 py-2.5 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent/50"
                      >
                        <Sparkles className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span>{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {messages.map((msg, i) => (
                    <MessageRow
                      key={i}
                      msg={msg}
                      copied={copied === i}
                      onCopy={() => copy(msg.content, i)}
                    />
                  ))}
                  {loading && <TypingRow />}
                  {showFollowUps && (
                    <div className="flex flex-wrap gap-2 pl-10">
                      {FOLLOW_UPS.map((f) => (
                        <button
                          key={f}
                          onClick={() => handleSend(f)}
                          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border/80 p-3">
            {error && <p className="mb-2 px-1 text-sm text-destructive">{error}</p>}
            <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border bg-background p-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your sales, top items, refunds…"
                className="max-h-36 min-h-9 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                rows={1}
                disabled={loading}
              />
              <Button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                size="icon"
                aria-label="Send message"
              >
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mx-auto mt-1.5 max-w-3xl px-1 text-center text-[11px] text-muted-foreground">
              Answers are based on your Clover data. Press Enter to send.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageRow({
  msg,
  copied,
  onCopy,
}: {
  msg: Message;
  copied: boolean;
  onCopy: () => void;
}) {
  const isUser = msg.role === "user";
  const time = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
      {isUser ? (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <User className="size-4" />
        </span>
      ) : (
        <LogoMark className="size-7 shrink-0" />
      )}
      <div className={cn("flex min-w-0 flex-col gap-1", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "max-w-[75ch] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "rounded-tr-sm bg-primary text-primary-foreground"
              : "rounded-tl-sm bg-muted text-foreground"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <>
              <Markdown>{msg.content}</Markdown>
              {msg.chart && <ChatChart chart={msg.chart} />}
            </>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 px-1 text-[11px] text-muted-foreground",
            isUser && "flex-row-reverse"
          )}
        >
          {time && <span>{time}</span>}
          {!isUser && (
            <button
              onClick={onCopy}
              className="flex items-center gap-1 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
              aria-label="Copy message"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TypingRow() {
  return (
    <div className="flex gap-3">
      <LogoMark className="size-7 shrink-0" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted px-4 py-3.5">
        <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-xl" />}>
      <ChatPageInner />
    </Suspense>
  );
}
