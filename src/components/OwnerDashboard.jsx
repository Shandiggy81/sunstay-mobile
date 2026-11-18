import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, PencilLine, X } from 'lucide-react';
import PartnerSunToday from './PartnerSunToday.jsx';
import PartnerToolsEditor from './PartnerToolsEditor.jsx';
import { PartnerSpecialEditor, PartnerToday, PartnerTodoList } from './PartnerToday.jsx';
import { PartnerGuestView, PartnerListingCheck } from './PartnerWalkthrough.jsx';
import ClayIcon from './common/ClayIcon.jsx';
import { usePartnerTools } from '../hooks/usePartnerTools.js';
import { ownerSwitchDefaults } from '../utils/venueFeaturePin.js';
import { partnerServiceHours, partnerTodayTasks } from '../utils/partnerToday.js';
import { partnerStatusGroups, partnerSunHint, partnerTagIcon, partnerTagSuggestions, partnerType } from '../utils/partnerVenueControls.js';
import { PARTNER_DRAFT_KEY, heatingConflict, offeringChanges, partnerDraftFor, resolveHeating, restorePartnerDrafts, updatePartnerDraft, venueWithHeating } from '../utils/partnerWalkthrough.js';
import './PartnerPreview.css';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const PREVIEW_NOTE = 'Preview updated on this device';
// Below this width the guest view is one tap away instead of beside the editor (PartnerPreview.css).
const SIDE_BY_SIDE = '(min-width: 1024px)';
const SECTION_FOR_TASK = { heating: 'partner-check-heading', hours: 'partner-hours-heading', outdoor: 'partner-outdoor-heading' };

// The listing-check answer stays on this device, like the rest of the partner preview.
function readDrafts() {
    try { return restorePartnerDrafts(localStorage.getItem(PARTNER_DRAFT_KEY)); } catch { return {}; }
}
function writeDrafts(map) {
    try {
        if (Object.keys(map).length) localStorage.setItem(PARTNER_DRAFT_KEY, JSON.stringify(map));
        else localStorage.removeItem(PARTNER_DRAFT_KEY);
    } catch { /* Private mode or blocked storage: the answer lasts while the panel is open. */ }
}
const sideBySide = () => typeof window !== 'undefined' && window.matchMedia?.(SIDE_BY_SIDE).matches;

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
    const contentRef = useRef(null);
    const frameRef = useRef(null);
    const specialRef = useRef(null);
    const editScrollRef = useRef(0);
    const returningRef = useRef(false);
    // The control that opened the guest view, for focus to come back to.
    const openerRef = useRef(null);
    const editButtonRef = useRef(null);
    const [now, setNow] = useState(() => new Date());
    const [hours, setHours] = useState(() => Object.fromEntries(DAYS.map(day => [day,
        venue.hours?.[day] && typeof venue.hours[day] === 'object' ? { ...venue.hours[day] }
            : { open: '', close: '', closed: true },
    ])));
    const [showHoursEdit, setShowHoursEdit] = useState(false);
    const [hoursStatus, setHoursStatus] = useState('');
    const [vibeStatus, setVibeStatus] = useState('');
    const [customTag, setCustomTag] = useState('');
    // The heating check reads the listing as it was when the panel opened, so
    // previewing tags below doesn't make the question vanish mid-answer.
    const [conflict] = useState(() => heatingConflict(venue));
    const [drafts, setDrafts] = useState(readDrafts);
    const heating = conflict ? partnerDraftFor(drafts, venueId) : null;
    const { tools, update } = usePartnerTools(venueId);
    // Phone and narrow windows show one view at a time; wide windows show both.
    const [view, setView] = useState('edit');
    const [guestChecked, setGuestChecked] = useState(false);
    const [activeTags, setActiveTags] = useState(() => {
        const tags = Array.isArray(venue.tags) ? venue.tags : Array.isArray(venue.vibe) ? venue.vibe : venue.vibe ? [venue.vibe] : [];
        const own = [...new Set(tags.filter(tag => typeof tag === 'string' && tag.trim()))];
        // A heating answer from an earlier visit already shapes the tags shown below.
        return (heating ? resolveHeating({ ...venue, tags: own }, heating).tags : own).slice(0, 8);
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
    // The guest card with this preview's answers on it.
    const guestVenue = useMemo(() => venueWithHeating(venue, heating), [venue, heating]);
    const removed = heating ? offeringChanges(venue, guestVenue).removed : [];
    const tasks = partnerTodayTasks({ venue: guestVenue, tools, heatingConflict: conflict, heatingAnswered: Boolean(heating),
        hoursKnown: Boolean(partnerServiceHours(venue)), guestChecked });

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

    const chooseHeating = choice => {
        const next = updatePartnerDraft(drafts, venueId, choice);
        setDrafts(next);
        writeDrafts(next);
        setActiveTags(tags => resolveHeating({ ...venue, tags }, choice).tags.slice(0, 8));
    };

    // Scroll the guest card to its Specials line, so the manager sees the change.
    const revealSpecial = useCallback(() => {
        const frame = frameRef.current;
        const scroller = frame?.querySelector('[data-venue-card-scroller]');
        const target = frame?.querySelector('[data-venue-section="specials"]');
        if (!scroller || !target || !frame.getClientRects().length) return;
        const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 96;
        scroller.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
        target.classList.add('ss-partner-flash');
        setTimeout(() => target.classList.remove('ss-partner-flash'), 1600);
    }, []);
    // Phone: one tap to the guest view and back. The editor stays mounted while
    // hidden, so every unsaved field is kept, and its scroll position comes back.
    const guestHeading = () => frameRef.current?.closest('section')?.querySelector('h3');
    const showView = next => {
        if (next === view) return;
        if (next === 'guest') {
            editScrollRef.current = contentRef.current?.scrollTop ?? 0;
            openerRef.current = document.activeElement;
            setGuestChecked(true);
        } else returningRef.current = true;
        setView(next);
    };
    useLayoutEffect(() => {
        // The control that switched views can sit in the half that just hid (a
        // to-do row, the guest card's close). Then focus moves to the half now
        // showing instead of being lost; the Edit and Guest view buttons keep it.
        const active = document.activeElement;
        const focusLost = !(active instanceof HTMLElement) || active === document.body || !active.getClientRects().length;
        if (view === 'guest') {
            revealSpecial();
            if (focusLost) guestHeading()?.focus({ preventScroll: true });
        } else if (returningRef.current) {
            returningRef.current = false;
            contentRef.current?.scrollTo({ top: editScrollRef.current, behavior: 'instant' });
            const opener = openerRef.current;
            const canReturn = opener instanceof HTMLElement && opener !== document.body && panelRef.current?.contains(opener) && opener.getClientRects().length > 0;
            if (focusLost) (canReturn ? opener : editButtonRef.current)?.focus({ preventScroll: true });
        }
    }, [view, revealSpecial]);
    // Wide windows: a new special shows in the guest view beside the editor as it saves.
    const deal = tools?.happyHour?.deal ?? '';
    const firstDeal = useRef(true);
    useEffect(() => {
        if (firstDeal.current) { firstDeal.current = false; return; }
        if (deal && sideBySide()) revealSpecial();
    }, [deal, revealSpecial]);

    const scrollEditorTo = element => {
        const content = contentRef.current;
        if (!content || !element) return;
        content.scrollTo({ top: element.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 12 });
    };
    const openTask = target => {
        if (target === 'guest') {
            setGuestChecked(true);
            if (sideBySide()) { revealSpecial(); guestHeading()?.focus({ preventScroll: true }); }
            else showView('guest');
            return;
        }
        if (target === 'special') {
            scrollEditorTo(specialRef.current?.closest('section'));
            specialRef.current?.focus({ preventScroll: true });
            return;
        }
        if (target === 'hours') setShowHoursEdit(true);
        const heading = panelRef.current?.querySelector(`#${SECTION_FOR_TASK[target]}`);
        scrollEditorTo(heading?.closest('section'));
        heading?.closest('section')?.querySelector('input, button')?.focus({ preventScroll: true });
    };

    return createPortal(<div className="ss-partner-overlay" onClick={onClose} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
            const controls = [...panelRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')]
                .filter(element => element.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    }}>
        <motion.section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="partner-preview-title" className="ss-partner-panel ss-partner-panel--guest"
            initial={reduceMotion ? false : { y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }}
            onClick={event => event.stopPropagation()}>
            <header className="ss-partner-header">
                <div className="ss-partner-title"><h2 id="partner-preview-title">{venueName}</h2><div className="ss-partner-chips">
                    <span className="ss-partner-type"><ClayIcon name={type.icon} size={24} />{type.label}</span>
                    <span className="ss-partner-preview-pill">Partner preview</span>
                </div></div>
                <button type="button" className="ss-partner-close" onClick={onClose} aria-label="Close partner preview"><X size={20} aria-hidden="true" /></button>
            </header>
            <div className="ss-partner-body" data-view={view}>
            <div ref={contentRef} className="ss-partner-content">
                <PartnerToday venue={venue} now={now} />
                <PartnerSpecialEditor ref={specialRef} tools={tools} update={update} />
                <PartnerTodoList tasks={tasks} onTask={openTask} />
                {conflict ? <PartnerListingCheck conflict={conflict} heating={heating} onHeatingChange={chooseHeating} /> : null}
                <PartnerSunToday venue={venue} now={now} />
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
                    <p className="ss-partner-help">{hasHours ? 'Use your actual opening hours to preview your next service and its weather.' : 'Set your opening hours here to preview your next service and its weather.'}</p>
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
                <PartnerToolsEditor venueId={venueId} />
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
            <div className="ss-partner-guest-column">
                <PartnerGuestView ref={frameRef} venue={guestVenue} liveVenueFeatures={liveVenueFeatures} removed={removed} onBack={() => showView('edit')} />
            </div>
            </div>
            <div className="ss-partner-viewbar" role="group" aria-label="Partner preview view">
                <button ref={editButtonRef} type="button" aria-pressed={view === 'edit'} onClick={() => showView('edit')}><PencilLine size={18} aria-hidden="true" />Edit</button>
                <button type="button" aria-pressed={view === 'guest'} onClick={() => showView('guest')}><Eye size={18} aria-hidden="true" />Guest view</button>
            </div>
        </motion.section>
    </div>, document.body);
}

export default function OwnerDashboard(props) {
    return props.venue ? <OwnerDashboardInner key={props.venue.id} {...props} /> : null;
}
