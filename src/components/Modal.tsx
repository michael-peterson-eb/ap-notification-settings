import React, { useEffect, useRef, useState } from 'react';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  widthClassName?: string;
  transitionMs?: number;
};

export function Modal({ open, onClose, title, children, closeOnBackdrop = true, closeOnEscape = true, widthClassName = 'max-w-5xl', transitionMs = 220 }: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);

      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(raf2);
      });

      return () => cancelAnimationFrame(raf1);
    } else {
      setShown(false);
      const t = window.setTimeout(() => setMounted(false), transitionMs);
      return () => window.clearTimeout(t);
    }
  }, [open, transitionMs]);

  useEffect(() => {
    if (!mounted || !shown || !closeOnEscape) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mounted, shown, closeOnEscape, onClose]);

  useEffect(() => {
    if (!mounted || !shown) return;
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [mounted, shown]);

  if (!mounted) return null;

  const overlayStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transition: `opacity ${transitionMs}ms ease`,
    pointerEvents: shown ? 'auto' : 'none',
  };

  const backdropStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transition: `opacity ${transitionMs}ms ease`,
  };

  const panelStyle: React.CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? 'translateY(0px) scale(1)' : 'translateY(10px) scale(0.98)',
    transition: `opacity ${transitionMs}ms ease, transform ${transitionMs}ms ease`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={overlayStyle} aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" style={backdropStyle} onClick={() => closeOnBackdrop && onClose()} />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={['relative z-10 w-[95vw]', widthClassName, 'max-h-[90vh] overflow-hidden rounded-lg border border-zinc-300 bg-white shadow-xl', 'flex flex-col'].join(' ')}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
          <div className="min-w-0">{title ? <div className="truncate text-sm font-medium">{title}</div> : <div className="truncate text-sm font-medium">Modal</div>}</div>

          <button type="button" className="rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50" onClick={onClose}>
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 bg-zinc-100">{children}</div>
      </div>
    </div>
  );
}
