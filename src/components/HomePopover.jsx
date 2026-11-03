import { useEffect, useId, useRef, useState } from 'react';

/** Keep children mounted: MapTimeControls resolves its portal target once. */
export default function HomePopover({ label, trigger, children, className = '' }) {
    const [open, setOpen] = useState(false);
    const wrapper = useRef(null), button = useRef(null);
    const id = useId();
    useEffect(() => {
        if (!open) return;
        const close = (returnFocus = true) => { setOpen(false); if (returnFocus) button.current?.focus({ preventScroll: true }); };
        const outside = event => {
            // Fine-tune is the existing nested portal; it owns its own Escape/outside handling.
            if (!wrapper.current?.contains(event.target) && !event.target.closest?.('#map-time-popover')) {
                // Let a tapped input or button keep its focus; background taps restore the trigger.
                close(!event.target.closest?.('button,input,select,textarea,a[href],[tabindex]'));
            }
        };
        const escape = event => {
            if (event.key === 'Escape' && !document.querySelector('#map-time-popover:not([hidden])')) {
                event.stopPropagation(); close();
            }
        };
        document.addEventListener('pointerup', outside);
        document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerup', outside); document.removeEventListener('keydown', escape); };
    }, [open]);
    return <div ref={wrapper} className={`ss-home-popover ${className}`} onPointerDownCapture={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <button ref={button} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} aria-controls={id}
            onClick={() => setOpen(value => !value)}>{trigger}</button>
        <div id={id} role="dialog" aria-label={label} hidden={!open} className="ss-home-popover-panel">{children}</div>
    </div>;
}
