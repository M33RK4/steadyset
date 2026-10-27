"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, cx } from "./primitives";
import { Icon } from "./Icon";

/** Accessible modal: focus is moved in and trapped, Escape closes, focus returns on close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  description,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      el ? Array.from(el.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')) : [];
    const first = focusables().find((f) => f.dataset.autofocus !== undefined) ?? focusables()[0];
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (!list.length) return;
        const a = list[0];
        const z = list[list.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative card anim-pop w-full max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-b-[var(--r-card)]",
          size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <div className="sticky top-0 z-10 bg-surface flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 id={titleId} className="text-xl leading-snug">
              {title}
            </h2>
            {description && <div className="text-muted text-sm mt-1">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-10 w-10 -mr-2 -mt-1 grid place-items-center rounded-ctl hover:bg-raised shrink-0">
            <Icon name="x" size={20} />
          </button>
        </div>
        {children && <div className="px-5 pb-5">{children}</div>}
        {footer && <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-4 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- confirm()

type ConfirmOpts = { title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)} data-autofocus>
              {state?.cancelLabel ?? "Cancel"}
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {state?.confirmLabel}
            </Button>
          </>
        }
      >
        {state?.body && <div className="text-muted">{state.body}</div>}
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---------------------------------------------------------------- toasts

type Toast = { id: number; message: string; tone: "info" | "success" | "error"; action?: { label: string; onClick: () => void } };
const ToastCtx = createContext<(message: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const toast = useCallback((message: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number }) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts?.duration ?? 3800);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div aria-live="polite" className="fixed z-[70] left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+12px)] flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="anim-pop pointer-events-auto flex items-center gap-3 rounded-ctl px-4 py-3 shadow-lg bg-ink text-bg"
          >
            <Icon name={t.tone === "success" ? "check" : t.tone === "error" ? "alert" : "info"} size={18} />
            <span className="flex-1 text-sm font-medium">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="text-sm font-bold underline underline-offset-2"
                onClick={() => {
                  t.action!.onClick();
                  setToasts((x) => x.filter((y) => y.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
