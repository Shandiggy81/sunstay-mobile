import { useEffect, useId, useRef, useState } from 'react';

// Opening order determines the fallback owner, not document listener order.
const openPopovers = new Set();

/** Keep children mounted: MapTimeControls resolves its portal target once. */
export default function HomePopover({ label, triggerLabel = label, trigger, children, className = '' }) {
    const [open, setOpen] = useState(false);
    const wrapper = useRef(null), button = useRef(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const entry = { wrapper: wrapper.current, button: button.current };
        openPopovers.add(entry);
        const modalElsewhere = () => [...document.querySelectorAll('[aria-modal="true"]')]
            .some(dialog => dialog.getClientRects().length > 0 && !dialog.contains(button.current));
        const close = (returnFocus = true) => {
            setOpen(false);
            const activeDialog = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
            if (returnFocus && !modalElsewhere() && (!activeDialog || wrapper.current?.contains(document.activeElement) || activeDialog.contains(button.current))) button.current?.focus({ preventScroll: true });
        };
        const outside = event => {
            // Fine-tune is the existing nested portal; it owns its own Escape/outside handling.
            if (!wrapper.current?.contains(event.target) && !event.target.closest?.('#map-time-popover')) {
                // Let a tapped input or button keep its focus; background taps restore the trigger.
                close(!event.target.closest?.('button,input,select,textarea,a[href],[tabindex]'));
            }
        };
        const escape = event => {
            if (event.key !== 'Escape' || event.defaultPrevented || modalElsewhere() || document.querySelector('#map-time-popover:not([hidden])')) return;
            if (event.target.closest?.('[role="dialog"], [role="alertdialog"]') && !wrapper.current?.contains(event.target)) return;
            const latestFirst = [...openPopovers].reverse().filter(({ wrapper: node, button: trigger }) =>
                trigger?.getAttribute('aria-expanded') === 'true' && node?.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden');
            const owner = latestFirst.find(item => item.wrapper.contains(event.target)) ?? latestFirst[0];
            if (owner !== entry) return;
            event.preventDefault();
            event.stopPropagation();
            close();
        };
        document.addEventListener('pointerup', outside);
        document.addEventListener('keydown', escape);
        return () => {
            openPopovers.delete(entry);
            document.removeEventListener('pointerup', outside);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);
    return <div ref={wrapper} className={`ss-home-popover ${className}`} onPointerDownCapture={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <button ref={button} type="button" aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
            onClick={() => setOpen(value => !value)}>{trigger}</button>
        <div id={id} role="dialog" aria-label={label} hidden={!open} className="ss-home-popover-panel">{children}</div>
    </div>;
}
