import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

const LIMIT = 30;

export function Logs() {
  const [page, setPage] = useState(1);
  const list = useQuery({ queryKey: ["audit", page], queryFn: () => apiGet(`/api/audit-logs?limit=${LIMIT}&page=${page}`) });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT));

  return (
    <Card>
      <CardHeader><CardTitle>ประวัติการทำงาน (audit log)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <THead><TR><TH>เวลา</TH><TH>action</TH><TH>entity</TH><TH>โดย</TH></TR></THead>
          <TBody>
            {(list.data?.items ?? []).map((a: any) => (
              <TR key={a.id}>
                <TD className="text-xs">{a.created_at?.replace("T", " ").slice(0, 19)}</TD>
                <TD>{a.action}</TD>
                <TD className="text-xs">{a.entity_type}{a.entity_id ? ` (${a.entity_id.slice(0, 8)})` : ""}</TD>
                <TD className="text-xs">{a.actor_type ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 mt-3 text-sm">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</Button>
            <span>{page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>ถัดไป</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
