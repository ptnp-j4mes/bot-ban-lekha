import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { KV } from "@/components/ui/dialog";

const LIMIT = 30;
const ts = (s?: string) => s?.replace("T", " ").slice(0, 19) ?? "—";
const json = (v: any) => (v == null ? "—" : <pre className="max-w-xs whitespace-pre-wrap break-words text-left text-xs">{JSON.stringify(v, null, 2)}</pre>);

export function Logs() {
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["audit", page], queryFn: () => apiGet(`/api/audit-logs?limit=${LIMIT}&page=${page}`) });
  const inbound = useQuery({ queryKey: ["inbound-messages", page], queryFn: () => apiGet(`/api/message-logs?limit=${LIMIT}&page=${page}`) });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT));
  const inboundPages = Math.max(1, Math.ceil((inbound.data?.total ?? 0) / LIMIT));

  const columns: Column<any>[] = [
    { key: "created_at", header: "เวลา", sortValue: (a) => a.created_at, cell: (a) => <span className="text-xs">{ts(a.created_at)}</span> },
    { key: "action", header: "action", sortValue: (a) => a.action, cell: (a) => a.action },
    { key: "entity", header: "entity", sortValue: (a) => a.entity_type, cell: (a) => <span className="text-xs">{a.entity_type}{a.entity_id ? ` (${a.entity_id.slice(0, 8)})` : ""}</span> },
    { key: "actor", header: "โดย", sortValue: (a) => a.actor_type, cell: (a) => <span className="text-xs">{a.actor_type ?? "—"}</span> },
  ];

  const inboundColumns: Column<any>[] = [
    { key: "created_at", header: "เวลา", sortValue: (a) => a.sent_at, cell: (a) => <span className="text-xs">{ts(a.sent_at)}</span> },
    { key: "user", header: "ผู้ส่ง", sortValue: (a) => a.source_name || a.line_user_id || "", cell: (a) => <div>{a.source_name || "—"}<div className="fig text-xs text-muted-foreground">{a.line_user_id || "—"}</div></div> },
    { key: "source", header: "แหล่งที่มา", sortValue: (a) => a.source_type || "", cell: (a) => a.source_type || "—" },
    { key: "type", header: "ประเภท", sortValue: (a) => a.message_type, cell: (a) => a.message_type.replace(/^inbound_/, "") },
    { key: "text", header: "ข้อความ", cell: (a) => <span className="block max-w-md truncate">{a.message_text || "—"}</span> },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle>ข้อความ LINE ขาเข้า ({inbound.data?.total ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={inbound.data?.items ?? []}
            columns={inboundColumns}
            rowKey={(a) => a.id}
            initialSort={{ key: "created_at", dir: "desc" }}
            empty="ยังไม่มีข้อความขาเข้า"
            detailTitle="รายละเอียดข้อความ LINE"
            detail={(a) => ({
              body: <KV pairs={[
                ["เวลา", ts(a.sent_at)],
                ["ผู้ส่ง", `${a.source_name ?? "—"} · ${a.line_user_id ?? "—"}`],
                ["ประเภท", a.message_type],
                ["ข้อความ", a.message_text],
                ["LINE event", json(a.line_event)],
              ]} />,
            })}
          />
        </CardContent>
        {inboundPages > 1 && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
            <span>{page} / {inboundPages}</span>
            <Button size="sm" variant="outline" disabled={page >= inboundPages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>ประวัติการทำงาน (audit log)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            data={list.data?.items ?? []}
            columns={columns}
            rowKey={(a) => a.id}
            initialSort={{ key: "created_at", dir: "desc" }}
            empty="ยังไม่มีประวัติ"
            detailTitle="รายละเอียด audit"
            detail={(a) => ({
              body: <KV pairs={[
                ["เวลา", ts(a.created_at)],
                ["action", a.action],
                ["entity", `${a.entity_type}${a.entity_id ? ` (${a.entity_id})` : ""}`],
                ["actor", `${a.actor_type ?? "—"}${a.actor_id ? ` · ${a.actor_id.slice(0, 8)}` : ""}`],
                ["old", json(a.old_value)],
                ["new", json(a.new_value)],
              ]} />,
            })}
          />
        </CardContent>
        {pages > 1 && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
            <span>{page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
