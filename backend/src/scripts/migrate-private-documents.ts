import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { env } from "../env";
import { deleteSlipFile, readStoredFile, storeCustomerDocument } from "../services/storage";

const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

export async function migratePrivateDocuments(batchSize = 100) {
  const privateBucket = env.s3PrivateBucket.trim();
  if (!privateBucket || privateBucket === env.s3Bucket.trim()) throw new Error("S3_PRIVATE_BUCKET must be configured and differ from S3_BUCKET");

  const documents = await prisma.customerDocument.findMany({
    where: { fileUrl: { not: { startsWith: `s3://${privateBucket}/` } } },
    orderBy: { id: "asc" },
    take: Math.max(1, Math.min(Math.floor(batchSize), 1000)),
  });
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const document of documents) {
    if (!document.fileUrl.startsWith("s3://") && !document.fileUrl.startsWith("http://") && !document.fileUrl.startsWith("https://")) {
      skipped++;
      continue;
    }
    try {
      const source = await readStoredFile(document.fileUrl);
      if (!source.ok) throw new Error(`source read failed: ${source.status}`);
      const bytes = new Uint8Array(await source.arrayBuffer());
      const ext = document.originalFileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const target = await storeCustomerDocument(document.orgId, document.customerId, document.id, Buffer.from(bytes), ext, document.mimeType);
      const copied = await readStoredFile(target);
      if (!copied.ok) throw new Error(`private read failed: ${copied.status}`);
      const copiedBytes = new Uint8Array(await copied.arrayBuffer());
      if (digest(bytes) !== digest(copiedBytes)) throw new Error("private copy verification failed");
      const removed = await deleteSlipFile(document.fileUrl);
      if (removed === "skipped") throw new Error("source deletion skipped");
      await prisma.customerDocument.update({ where: { id: document.id }, data: { fileUrl: target } });
      migrated++;
    } catch (error) {
      failed++;
      console.error(`customer document ${document.id} migration failed:`, error instanceof Error ? error.message : error);
    }
  }
  return { scanned: documents.length, migrated, skipped, failed, hasMore: documents.length === batchSize };
}

if (import.meta.main) {
  const batchSize = Number(process.argv[2] ?? 100);
  migratePrivateDocuments(batchSize)
    .then((result) => { console.log(JSON.stringify(result)); })
    .catch((error) => { console.error(error); process.exitCode = 1; });
}
