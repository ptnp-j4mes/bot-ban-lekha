import { StorageManager } from "@/components/StorageManager";
import { GoogleDriveManager } from "@/components/GoogleDriveManager";
import { R2UsageMonitor } from "@/components/R2UsageMonitor";

export function StorageSettings() {
  return (
    <div className="space-y-5">
      <StorageManager />
      <R2UsageMonitor />
      <GoogleDriveManager />
    </div>
  );
}
