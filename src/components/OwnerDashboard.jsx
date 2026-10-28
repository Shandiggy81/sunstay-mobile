import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import FohWeatherWidget from './FohWeatherWidget.jsx';
import PartnerSunToday from './PartnerSunToday.jsx';
import ClayIcon from './common/ClayIcon.jsx';
import { ownerSwitchDefaults } from '../utils/venueFeaturePin.js';
import { partnerStatusGroups, partnerSunHint, partnerTagIcon, partnerTagSuggestions, partnerType } from '../utils/partnerVenueControls.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const PREVIEW_NOTE = 'Preview updated on this device';

function StatusTile({ label, icon, value, onChange }) {
    return <button type="button" className="ss-partner-toggle" role="switch" aria-checked={value} onClick={() => onChange(!value)}>
        <ClayIcon name={icon} size={56} />
        <span className="ss-partner-toggle-label">{label}<small>{value ? 'On' : 'Off'}</small></span>
        <span className="ss-partner-switch" aria-hidden="true"><span /></span>
    </button>;
}

function OwnerDashboardInner({ venue, onClose, liveVenueFeatures, setLiveVenueFeatures, onVenueUpdate }) {
    const venueId = venue.id;
    const venueName = venue.venueName || venue.name || 'Your venue';
    const type = partnerType(venue);
    const reduceMotion = useReducedMotion();
    const panelRef = useRef(null);
    const [now, setNow] = useState(() => new Date());
    const [hours, setHours] = useState(() => Object.fromEntries(DAYS.map(day => [day,
        venue.hours?.[day] && typeof venue.hours[day] === 'object' ? { ...venue.hours[day] }
            : { open: '', close: '', closed: true },
    ])));
    const [showHoursEdit, setShowHoursEdit] = useState(false);
    const [hoursStatus, setHoursStatus] = useState('');
    const [vibeStatus, setVibeStatus] = useState('');
    const [customTag, setCustomTag] = useState('');
    const [activeTags, setActiveTags] = useState(() => {
        const tags = Array.isArray(venue.tags) ? venue.tags : Array.isArray(venue.vibe) ? venue.vibe : venue.vibe ? [venue.vibe] : [];
        return [...new Set(tags.filter(tag => typeof tag === 'string' && tag.trim()))].slice(0, 8);
    });
    // Tags from the last "Preview tags", kept on this device; they drive the switches below.
    const [previewedTags, setPreviewedTags] = useState(null);
    const live = liveVenueFeatures?.[venueId] ?? {};
    // Live switches start from what was set on this device only: owning a
    // fireplace doesn't mean it's lit, and stored row values aren't live.
    const [status, setStatus] = useState(() => ownerSwitchDefaults(live));
    const groups = partnerStatusGroups(venue, previewedTags);
    const sunHint = partnerSunHint(venue, previewedTags);
    const suggestions = partnerTagSuggestions(venue);

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);
    useEffect(() => {
        const previous = document.activeElement;
        const root = document.getElementById('root');
        const wasInert = root?.inert;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        if (root) root.inert = true;
        panelRef.current?.querySelector('[aria-label="Close partner preview"]')?.focus({ preventScroll: true });
        return () => {
            document.body.style.overflow = previousOverflow;
            if (root) root.inert = wasInert;
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
        };
    }, []);

    // Keep the existing device-local feature keys and pin preview updates.
    // No Supabase client or write: partner persistence needs a server-side path.
    const toggleStatus = useCallback((key, value) => {
        setStatus(previous => ({ ...previous, [key]: value }));
        setLiveVenueFeatures?.(previous => ({
            ...previous,
            [venueId]: { ...(previous?.[venueId] || {}), [key]: value },
        }));
        onVenueUpdate?.({ [key]: value });
    }, [venueId, setLiveVenueFeatures, onVenueUpdate]);
    const addTag = tag => {
        if (activeTags.length >= 8 || activeTags.includes(tag)) return;
        setActiveTags(tags => [...tags, tag]);
    };
    const addCustomTag = () => {
        const tag = customTag.trim().slice(0, 20);
        if (!tag || activeTags.includes(tag) || activeTags.length >= 8) return;
        addTag(tag); setCustomTag('');
    };
    const hasHours = DAYS.some(day => hours[day].open || hours[day].close);

    return createPortal(<div className="ss-partner-overlay" onClick={onClose} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
            const controls = [...panelRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), a[href]')];
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }}>
        <motion.section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="partner-preview-title" className="ss-partner-panel"
            initial={reduceMotion ? false : { y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            onClick={event => event.stopPropagation()}>
            <header className="ss-partner-header">
                <div className="ss-partner-title"><h2 id="partner-preview-title">{venueName}</h2><div className="ss-partner-chips">
                    <span className="ss-partner-type"><ClayIcon name={type.icon} size={24} />{type.label}</span>
                    <span className="ss-partner-preview-pill">Partner preview</span>
                </div></div>
                <button type="button" className="ss-partner-close" onClick={onClose} aria-label="Close partner preview"><X size={20} aria-hidden="true" /></button>
            </header>
            <div className="ss-partner-content">
                <aside role="note" className="ss-partner-notice"><ClayIcon name="house" size={32} /><p><strong>Preview only.</strong> Changes stay on this device until partner editing launches.</p></aside>
                <PartnerSunToday venue={venue} now={now} />
                <FohWeatherWidget venue={venue} hours={hours} now={now} />
                {(groups.length > 0 || sunHint) && <section className="ss-partner-card" aria-labelledby="partner-status-heading">
                    <h3 id="partner-status-heading">Live status preview</h3>
                    <p className="ss-partner-help">Try a status to preview your map pin on this device. Guests won’t see these changes.</p>
                    {sunHint && <fieldset className="ss-partner-toggle-group"><legend>Sun &amp; shade</legend>
                        <p className="ss-partner-notice"><ClayIcon name="beer-garden" size={40} /><span>{sunHint}</span></p>
                    </fieldset>}
                    {groups.map(group => <fieldset key={group.label} className="ss-partner-toggle-group"><legend>{group.label}</legend>
                        {group.controls.map(({ key: controlKey, ...control }) => <StatusTile key={controlKey} {...control} value={status[controlKey]} onChange={value => toggleStatus(controlKey, value)} />)}
                    </fieldset>)}
                </section>}
                <section className="ss-partner-card" aria-labelledby="partner-hours-heading">
                    <div className="ss-partner-section-heading"><ClayIcon name="clock" size={40} /><h3 id="partner-hours-heading">Service hours</h3></div>
                    <p className="ss-partner-help">{hasHours ? 'Use your actual opening hours to preview relevant weather tips.' : 'Hours not supplied. Add your opening hours to preview relevant weather tips.'}</p>
                    <button type="button" className="ss-partner-button ss-partner-button--soft" aria-expanded={showHoursEdit} onClick={() => setShowHoursEdit(value => !value)}>{showHoursEdit ? 'Hide service hours' : 'Edit service hours'}</button>
                    {showHoursEdit && <div className="ss-partner-hours">
                        {DAYS.map(day => <div key={day} className="ss-partner-day"><span>{DAY_LABELS[day]}</span>
                            <button type="button" aria-label={`${DAY_LABELS[day]} open`} aria-pressed={!hours[day].closed} onClick={() => setHours(previous => ({ ...previous, [day]: { ...previous[day], closed: !previous[day].closed } }))}>{hours[day].closed ? 'Closed' : 'Open'}</button>
                            {!hours[day].closed && <div className="ss-partner-time-range">
                                <input aria-label={`${DAY_LABELS[day]} opening time`} type="time" value={hours[day].open} onChange={event => setHours(previous => ({ ...previous, [day]: { ...previous[day], open: event.target.value } }))} />
                                <span>to</span>
                                <input aria-label={`${DAY_LABELS[day]} closing time`} type="time" value={hours[day].close} onChange={event => setHours(previous => ({ ...previous, [day]: { ...previous[day], close: event.target.value } }))} />
                            </div>}
                        </div>)}
                        <button type="button" className="ss-partner-button" onClick={() => { onVenueUpdate?.({ ...venue, hours }); setHoursStatus(PREVIEW_NOTE); }}>Preview service hours</button>
                    </div>}
                    <p role="status" className="ss-partner-save-status">{hoursStatus}</p>
                </section>
                <section className="ss-partner-card" aria-labelledby="partner-tags-heading">
                    <div className="ss-partner-section-heading"><ClayIcon name="sparkles" size={40} /><div><h3 id="partner-tags-heading">Your venue’s tags</h3><p>{activeTags.length}/8 tags · preview only</p></div></div>
                    <div className="ss-partner-tags">{activeTags.map(tag => <button type="button" key={tag} aria-label={`Remove ${tag}`} onClick={() => setActiveTags(tags => tags.filter(value => value !== tag))}>
                        <ClayIcon name={partnerTagIcon(tag)} size={28} /><span>{tag}</span><X size={14} aria-hidden="true" />
                    </button>)}</div>
                    <p className="ss-partner-help">Add what fits your venue</p>
                    <div className="ss-partner-tags ss-partner-suggestions">{suggestions.map(tag => <button type="button" key={tag} disabled={activeTags.includes(tag) || activeTags.length >= 8} onClick={() => addTag(tag)}><ClayIcon name={partnerTagIcon(tag)} size={28} /><span>{tag}</span></button>)}</div>
                    <div className="ss-partner-custom-tag"><input aria-label="Custom tag" type="text" placeholder="Add your own tag" maxLength={20} value={customTag} onChange={event => setCustomTag(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') addCustomTag(); }} /><button type="button" className="ss-partner-button ss-partner-button--soft" disabled={!customTag.trim() || activeTags.length >= 8} onClick={addCustomTag}>Add</button></div>
                    <button type="button" className="ss-partner-button" onClick={() => { setPreviewedTags(activeTags); onVenueUpdate?.({ ...venue, tags: activeTags }); setVibeStatus(PREVIEW_NOTE); }}>Preview tags</button>
                    <p role="status" className="ss-partner-save-status">{vibeStatus}</p>
                </section>
                <section className="ss-partner-card ss-partner-invite"><ClayIcon name="sun" size={56} /><h3>Want this live for your guests?</h3><p>Let’s bring your venue’s sun story to SunStay.</p>
                    <a className="ss-partner-button" href={`mailto:sunstayglobal@gmail.com?subject=${encodeURIComponent(`SunStay partner enquiry: ${venueName}`)}`}>Become a SunStay partner</a>
                </section>
            </div>
        </motion.section>
    </div>, document.body);
}

export default function OwnerDashboard(props) {
    return props.venue ? <OwnerDashboardInner key={props.venue.id} {...props} /> : null;
}
