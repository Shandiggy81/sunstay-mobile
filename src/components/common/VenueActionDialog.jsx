import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import '../VenuePublishing.css';

export default function VenueActionDialog({ title, onClose, busy = false, children }) {
  const ref = useRef(null), id = useId();
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const root = document.getElementById('root'), wasInert = root?.inert;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('button')?.focus({ preventScroll: true });
    return () => {
      if (root) root.inert = wasInert;
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    if (busy) ref.current?.focus({ preventScroll: true });
  }, [busy]);
  return createPortal(<div className="ss-publish-overlay" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); if (!busy) onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...ref.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')]
      .filter(element => element.getClientRects().length);
    if (!controls.length) { event.preventDefault(); ref.current.focus({ preventScroll: true }); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className="ss-publish-dialog">
      <header><h2 id={id}>{title}</h2><button type="button" aria-label="Close venue action" title="Close" disabled={busy} onClick={onClose}><X size={22} aria-hidden="true" /></button></header>
      <div className="ss-publish-content">{children}</div>
    </section>
  </div>, document.body);
}
