import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ClayIcon from '../common/ClayIcon.jsx';
import { mapTimePresets, selectedMapTimePreset } from '../../utils/mapTimePresets.js';
import './MapTimeControls.css';

/** Presentation for TimeOfDayLight: every commit goes through its existing handlers. */
export default function MapTimeControls({ minutes, clock, timeLabel, nowMinutes, weather,
    onSelectMinutes, onJumpNow, rangeRef, rangeProps, hidden = false }) {
    const [target, setTarget] = useState(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 12 });
    const trigger = useRef(null);
    const popover = useRef(null);
    const releaseRange = useRef(rangeProps.onPointerCancel);
    releaseRange.current = rangeProps.onPointerCancel;
    const presets = useMemo(() => mapTimePresets({ weather }), [weather, nowMinutes]);
    const selected = selectedMapTimePreset(minutes, presets, timeLabel.atNow);

    useEffect(() => { setTarget(document.getElementById('explore-time-controls')); }, []);
    useEffect(() => {
        if (hidden) {
            // Removing a focused input need not fire blur; release the existing map-pan lock.
            releaseRange.current?.();
            setOpen(false);
        }
    }, [hidden]);
    // Preserve the slider's value reassertion when its portal first mounts.
    useLayoutEffect(() => {
        const input = rangeRef.current;
        if (input && input.value !== String(minutes)) input.value = String(minutes);
    });

    const close = (returnFocus = false) => {
        setOpen(false);
        if (returnFocus) trigger.current?.focus({ preventScroll: true });
    };
    useEffect(() => {
        if (!open) return undefined;
        const positionPopover = () => {
            const rect = trigger.current?.getBoundingClientRect();
            if (rect) setPosition({ top: rect.bottom + 8,
                left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(320, window.innerWidth - 24) - 12)) });
        };
        const outside = event => {
            if (!popover.current?.contains(event.target) && !trigger.current?.contains(event.target)) close();
        };
        const escape = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        };
        positionPopover();
        document.addEventListener('pointerdown', outside, true);
        document.addEventListener('keydown', escape);
        window.addEventListener('resize', positionPopover);
        return () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', escape);
            window.removeEventListener('resize', positionPopover);
        };
    }, [open]);

    if (!target || hidden) return null;
    return <>
        {createPortal(<>
            <span className="ss-map-time-shortcuts" role="group" aria-label="Preview time today">
                {/* Shortcuts with no time to show (Tomorrow, or Golden hour without a
                    live sunset) are hidden rather than shown as dead chips. */}
                {presets.filter(item => item.id === 'now' || item.minutes != null).map(item => <button key={item.id} type="button"
                    className="ss-map-time-chip" aria-pressed={selected === item.id}
                    title={item.id === 'golden' ? 'One hour before Melbourne sunset'
                            : item.id === 'lunch' ? 'Today at 12pm' : item.id === 'arvo' ? 'Today at 3pm' : timeLabel.label}
                    onClick={() => item.id === 'now' ? onJumpNow() : onSelectMinutes(item.minutes)}>
                    <span>{item.label}</span>
                </button>)}
            </span>
            <button ref={trigger} type="button" className="ss-map-time-chip ss-map-time-fine-tune"
                aria-label="Fine-tune preview time" aria-haspopup="dialog" aria-expanded={open}
                aria-controls="map-time-popover" onClick={() => setOpen(value => !value)}>
                <span><ClayIcon name="clock" size={18} />Fine-tune</span>
            </button>
        </>, target)}
        {createPortal(<div ref={popover} id="map-time-popover" role="dialog"
            aria-label="Fine-tune preview time" hidden={!open} className="ss-map-time-popover" style={position}>
            <div className="ss-map-time-popover-heading"><strong>Preview time</strong>
                <button type="button" aria-label="Close time controls" onClick={() => close(true)}><X size={18} /></button></div>
            <p>Today · Melbourne time</p>
            <div className="ss-map-time-popover-clock"><label htmlFor="tod-slider">{timeLabel.label}</label><output aria-live="polite">{clock}</output></div>
            <input ref={rangeRef} id="tod-slider" type="range" {...rangeProps}
                aria-label="Time of day for 3D building shadows" aria-valuetext={clock} />
        </div>, document.body)}
    </>;
}
