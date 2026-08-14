import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type ConfirmOptions = {
  title?: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PromptOptions = {
  title?: ReactNode;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmRequest = ConfirmOptions & { resolve: (value: boolean) => void };
type PromptRequest = PromptOptions & { resolve: (value: string | null) => void };

const ConfirmContext = createContext<((options: ConfirmOptions | string) => Promise<boolean>) | null>(null);
const PromptContext = createContext<((options: PromptOptions) => Promise<string | null>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [promptRequest, setPromptRequest] = useState<PromptRequest | null>(null);
  const [promptValue, setPromptValue] = useState("");

  const confirm = useCallback((options: ConfirmOptions | string) => new Promise<boolean>((resolve) => {
    const normalized = typeof options === "string" ? { message: options } : options;
    setConfirmRequest({ ...normalized, resolve });
  }), []);

  const prompt = useCallback((options: PromptOptions) => new Promise<string | null>((resolve) => {
    setPromptValue(options.defaultValue ?? "");
    setPromptRequest({ ...options, resolve });
  }), []);

  const closeConfirm = useCallback((result: boolean) => {
    const request = confirmRequest;
    setConfirmRequest(null);
    request?.resolve(result);
  }, [confirmRequest]);

  const closePrompt = useCallback((result: string | null) => {
    const request = promptRequest;
    setPromptRequest(null);
    setPromptValue("");
    request?.resolve(result);
  }, [promptRequest]);

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}

        <Dialog open={!!confirmRequest} onClose={() => closeConfirm(false)} title={confirmRequest?.title ?? "ยืนยันการทำรายการ"}>
          <div className="space-y-4">
            <p className="whitespace-pre-line text-sm leading-6 text-foreground">{confirmRequest?.message}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => closeConfirm(false)}>
                {confirmRequest?.cancelLabel ?? "ยกเลิก"}
              </Button>
              <Button type="button" variant={confirmRequest?.destructive ? "destructive" : "default"} onClick={() => closeConfirm(true)}>
                {confirmRequest?.confirmLabel ?? "ยืนยัน"}
              </Button>
            </div>
          </div>
        </Dialog>

        <Dialog open={!!promptRequest} onClose={() => closePrompt(null)} title={promptRequest?.title ?? "กรอกข้อมูล"}>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); closePrompt(promptValue); }}>
            {promptRequest?.message && <p className="text-sm leading-6 text-foreground">{promptRequest.message}</p>}
            <input
              autoFocus
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={promptRequest?.placeholder}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => closePrompt(null)}>
                {promptRequest?.cancelLabel ?? "ยกเลิก"}
              </Button>
              <Button type="submit">{promptRequest?.confirmLabel ?? "บันทึก"}</Button>
            </div>
          </form>
        </Dialog>
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider");
  return confirm;
}

export function usePrompt() {
  const prompt = useContext(PromptContext);
  if (!prompt) throw new Error("usePrompt must be used inside ConfirmProvider");
  return prompt;
}
