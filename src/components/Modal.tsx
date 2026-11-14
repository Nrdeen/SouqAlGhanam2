import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'md' | 'lg';
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const titleId = `modal-title-${title.replace(/\s+/g, '-')}`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] w-full shadow-xl overflow-hidden ${
          size === 'md' ? 'max-w-md' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 bg-[var(--color-cream)]/70 border-b border-[var(--color-border)]">
          <div>
            <h3 id={titleId} className="font-display text-lg font-bold text-[var(--color-ink)]">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">{subtitle}</p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-cream)] flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--color-ink)] shrink-0 transition-colors cursor-pointer"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="p-6 text-[var(--color-ink)]">{children}</div>
      </div>
    </div>
  );
}
