import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3, Inbox, MessageCircle, Search, UserRound } from "lucide-react";
import { apiGet, apiRaw } from "@/lib/api";
import { thDateTimeBangkok } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Conversation = {
  key: string;
  line_user_id: string;
  title: string;
  customer: { id: string; customer_code: string; display_name: string | null } | null;
  message_count: number;
  last_message: string | null;
  last_direction: "inbound" | "outbound" | null;
  last_message_type: string | null;
  last_status: string | null;
  last_message_at: string;
};

type ChatMessage = {
  id: string;
  line_user_id: string | null;
  direction: "inbound" | "outbound";
  source_type: string | null;
  source_name: string | null;
  message_type: string;
  message_text: string | null;
  status: string;
  error_message: string | null;
  sent_at: string;
};

const shortPreview = (text: string | null) => {
  if (!text) return "ไม่มีข้อความ";
  return text.replace(/\s+/g, " ").trim().slice(0, 72);
};

function ImageMessageLink({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);

  const showImage = async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await apiRaw(`/api/conversation-messages/${encodeURIComponent(id)}/image`);
      if (!response.ok) throw new Error("image unavailable");
      setSrc(URL.createObjectURL(await response.blob()));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  if (src) return <img src={src} alt="รูปภาพจาก LINE" className="max-h-80 max-w-full rounded-xl border border-border object-contain" />;
  return (
    <button type="button" onClick={() => void showImage()} disabled={loading} className="text-sm font-semibold underline underline-offset-4 disabled:cursor-wait disabled:opacity-60">
      {loading ? "กำลังโหลดรูปภาพ…" : error ? "ลองเปิดรูปภาพอีกครั้ง" : "เปิดดูรูปภาพ"}
    </button>
  );
}

export function ChatClone() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const hasInitializedSelection = useRef(false);

  const conversations = useQuery({
    queryKey: ["conversations", q],
    queryFn: () => apiGet<{ items: Conversation[]; total: number }>(`/api/conversations?limit=50&search=${encodeURIComponent(q)}`),
    refetchInterval: 30000,
  });
  const items = conversations.data?.items ?? [];

  useEffect(() => {
    if (!items.length) {
      setSelectedKey(null);
      return;
    }

    if (!hasInitializedSelection.current) {
      hasInitializedSelection.current = true;
      setSelectedKey(items[0].key);
      return;
    }

    // Keep the detail view closed after the mobile back button is pressed.
    // If a refreshed/search-filtered list removes the current conversation,
    // return to the list so the user can choose another one.
    if (selectedKey && !items.some((item) => item.key === selectedKey)) setSelectedKey(null);
  }, [items, selectedKey]);

  const detail = useQuery({
    queryKey: ["conversation", selectedKey],
    queryFn: () => apiGet<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/conversations/${encodeURIComponent(selectedKey ?? "")}`),
    enabled: !!selectedKey,
    refetchInterval: 30000,
  });
  const active = detail.data?.conversation ?? items.find((item) => item.key === selectedKey);

  return (
    <div className="space-y-2 md:space-y-4">
      <div className="flex justify-end">
        <Badge variant="secondary"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> {conversations.data?.total ?? 0} สนทนา</Badge>
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <div className="grid h-[clamp(480px,calc(100dvh-180px),640px)] min-h-0 grid-cols-1 md:h-[500px] md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={cn("min-h-0 flex flex-col border-b border-border bg-secondary/30 md:flex md:border-b-0 md:border-r", selectedKey ? "hidden" : "flex")}>
            <div className="shrink-0 border-b border-border p-3">
              <form className="relative" onSubmit={(event) => { event.preventDefault(); setQ(search.trim()); }}>
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อ / LINE ID / ข้อความ" className="h-10 bg-card pl-9 pr-3" />
              </form>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {conversations.isLoading && <div className="px-3 py-8 text-center text-sm text-muted-foreground">กำลังโหลดประวัติ…</div>}
              {!conversations.isLoading && !items.length && (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  <Inbox className="mx-auto mb-3 h-8 w-8 opacity-40" />
                  ยังไม่มีประวัติการสนทนา
                </div>
              )}
              {items.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                  className={cn(
                    "mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors",
                    selectedKey === item.key ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-card"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", selectedKey === item.key ? "bg-white/15" : "bg-card neu-raised-sm")}>
                      <UserRound className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{item.title}</span>
                        <span className={cn("shrink-0 text-[10px]", selectedKey === item.key ? "text-primary-foreground/70" : "text-muted-foreground")}>{thDateTimeBangkok(item.last_message_at).slice(0, 5)}</span>
                      </span>
                      <span className={cn("mt-0.5 block truncate text-xs", selectedKey === item.key ? "text-primary-foreground/75" : "text-muted-foreground")}>
                        {item.last_direction === "outbound" ? "คุณ: " : "ลูกค้า: "}{shortPreview(item.last_message)}
                      </span>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className={cn("min-h-0 min-w-0 flex-col bg-card", selectedKey ? "flex" : "hidden md:flex")}>
            {active ? (
              <>
                <header className="sticky top-0 z-10 flex min-h-[72px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur md:px-6">
                  <Button size="icon" variant="ghost" className="md:hidden" onClick={() => setSelectedKey(null)} aria-label="กลับไปยังรายการสนทนา"><ArrowLeft className="h-4 w-4" /></Button>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><UserRound className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-head text-base font-bold">{active.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {active.customer?.customer_code && <span>{active.customer.customer_code}</span>}
                      <span className="font-mono">{active.line_user_id}</span>
                    </div>
                  </div>
                  <Badge variant="outline"><Clock3 className="mr-1.5 h-3 w-3" /> {active.message_count} ข้อความ</Badge>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[linear-gradient(135deg,hsl(var(--background))_0%,hsl(var(--card))_100%)] px-3 py-5 md:px-8">
                  {detail.isLoading && <div className="py-12 text-center text-sm text-muted-foreground">กำลังโหลดข้อความ…</div>}
                  <div className="mx-auto flex max-w-3xl flex-col gap-3">
                    {(detail.data?.messages ?? []).map((message) => {
                      const outbound = message.direction === "outbound";
                      return (
                        <div key={message.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                          <div className={cn("max-w-[88%] md:max-w-[72%]", outbound ? "items-end" : "items-start")}>
                            <div className={cn("rounded-2xl px-4 py-3 text-sm shadow-sm", outbound ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border bg-card text-foreground")}>
                              {message.message_type === "inbound_image" ? (
                                <ImageMessageLink id={message.id} />
                              ) : (
                                <div className="whitespace-pre-wrap break-words">{message.message_text || `[${message.message_type}]`}</div>
                              )}
                              {message.status === "failed" && <div className="mt-2 text-xs text-red-200">ส่งไม่สำเร็จ: {message.error_message || "ไม่ทราบสาเหตุ"}</div>}
                            </div>
                            <div className={cn("mt-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground", outbound ? "justify-end" : "justify-start")}>
                              <span>{outbound ? "ระบบ" : (message.source_name || "ลูกค้า")}</span>
                              <span>·</span>
                              <span>{thDateTimeBangkok(message.sent_at)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <MessageCircle className="mb-3 h-10 w-10 opacity-30" />
                <p className="font-head font-semibold">เลือกบทสนทนาเพื่อดูประวัติ</p>
                <p className="mt-1 text-sm">ข้อความเข้าและข้อความตอบกลับจะเรียงตามเวลา</p>
              </div>
            )}
          </section>
        </div>
      </Card>
    </div>
  );
}
