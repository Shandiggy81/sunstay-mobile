import { useState } from 'react';
import { X } from 'lucide-react';
import ClayIcon from './common/ClayIcon.jsx';
import { usePartnerTools } from '../hooks/usePartnerTools.js';
import { EVENT_DAYS_AHEAD, EVENT_KINDS, MAX_EVENTS, PARTNER_DAYS, partnerClock } from '../utils/partnerTools.js';
import { partnerEventMaxDate, partnerHappyHourError } from '../utils/partnerToolsForm.js';
import './PartnerToolsEditor.css';

const EMPTY_HAPPY_HOUR = { days: [], start: '', end: '', deal: '' };
const EMPTY_EVENT = { title: '', kind: 'live-music', date: '', start: '' };
const ACCESS_CHOICES = [
    ['access_step_free_entry', 'Step-free entry'],
    ['access_lift', 'Lift'],
    ['access_accessible_toilet', 'Accessible toilet'],
];
const OUTDOOR_CHOICES = [
    ['umbrellas', 'Umbrellas'], ['awning', 'Awning'], ['retractableRoof', 'Retractable roof'],
    ['heaters', 'Outdoor heaters'], ['dogFriendly', 'Dog friendly'],
];
const numberOrNull = value => value === '' || value == null ? null : Number(value);

function Choice({ label, value, onChange, unsure = false }) {
    const options = unsure ? [[true, 'Yes'], [false, 'No'], [null, 'Not sure']] : [[true, 'Yes'], [false, 'No']];
    return <fieldset className="ss-partner-choice"><legend>{label}</legend>
        <div>{options.map(([choice, text]) => <button key={text} type="button" aria-pressed={value === choice}
            onClick={() => onChange(choice)}>{text}</button>)}</div>
    </fieldset>;
}

function Heading({ id, icon, children }) {
    return <div className="ss-partner-section-heading"><ClayIcon name={icon} size={40} /><h3 id={id}>{children}</h3></div>;
}

export default function PartnerToolsEditor({ venueId }) {
    const { tools, update } = usePartnerTools(venueId);
    const [happyHour, setHappyHour] = useState(() => ({ ...EMPTY_HAPPY_HOUR, ...tools?.happyHour,
        start: tools?.happyHour?.start ?? '', end: tools?.happyHour?.end ?? '', deal: tools?.happyHour?.deal ?? '' }));
    const [event, setEvent] = useState(EMPTY_EVENT);
    const [access, setAccess] = useState(() => tools?.access ?? {});
    const [outdoor, setOutdoor] = useState(() => tools?.outdoor ?? {});
    const [saved, setSaved] = useState({});
    const [happyError, setHappyError] = useState(null);
    const { today } = partnerClock();
    const maxDate = partnerEventMaxDate(today);
    const events = tools?.events ?? [];

    const edit = (section, setter, patch) => {
        setter(previous => ({ ...previous, ...patch }));
        setSaved(previous => ({ ...previous, [section]: false }));
        if (section === 'happyHour') setHappyError(null);
    };
    const save = (section, value) => {
        update(section, value);
        setSaved(previous => ({ ...previous, [section]: true }));
    };
    const confirmation = section => <p role="status" className="ss-partner-save-status">{saved[section] ? 'Saved on this device' : ''}</p>;
    const actions = (section, clear) => <div className="ss-partner-form-actions">
        <button type="submit" className="ss-partner-button">Save</button>
        <button type="button" className="ss-partner-button ss-partner-button--soft" onClick={clear}>Clear</button>
    </div>;

    return <>
        <section className="ss-partner-card ss-partner-tools-card" aria-labelledby="partner-happy-heading">
            <Heading id="partner-happy-heading" icon="pint">Specials &amp; happy hour</Heading>
            <form onSubmit={event => {
                event.preventDefault();
                const error = partnerHappyHourError(happyHour);
                setHappyError(error);
                if (!error) save('happyHour', happyHour);
            }}>
                <fieldset className="ss-partner-days"><legend>Happy hour days</legend><div>
                    {PARTNER_DAYS.map(day => <button type="button" key={day} aria-pressed={happyHour.days.includes(day)}
                        onClick={() => edit('happyHour', setHappyHour, { days: happyHour.days.includes(day)
                            ? happyHour.days.filter(value => value !== day) : [...happyHour.days, day] })}>{day}</button>)}
                </div></fieldset>
                <div className="ss-partner-form-row">
                    <label>Happy hour starts<input type="time" value={happyHour.start} onChange={event => edit('happyHour', setHappyHour, { start: event.target.value })} /></label>
                    <label>Happy hour ends<input type="time" value={happyHour.end} onChange={event => edit('happyHour', setHappyHour, { end: event.target.value })} /></label>
                </div>
                <label>Deal or special<input type="text" maxLength={80} value={happyHour.deal} onChange={event => edit('happyHour', setHappyHour, { deal: event.target.value })} /></label>
                <p className="ss-partner-help">Up to 80 characters. A deal can be saved without days or times.</p>
                {happyError && <p role="alert" className="ss-partner-form-error">{happyError}</p>}
                {actions('happyHour', () => { setHappyHour(EMPTY_HAPPY_HOUR); setHappyError(null); save('happyHour', null); })}
            </form>
            {confirmation('happyHour')}
        </section>

        <section className="ss-partner-card ss-partner-tools-card" aria-labelledby="partner-events-heading">
            <Heading id="partner-events-heading" icon="live-music">Tonight &amp; events</Heading>
            <p className="ss-partner-help">{events.length}/{MAX_EVENTS} events · today to {EVENT_DAYS_AHEAD} days ahead · Melbourne time</p>
            {events.length > 0 && <ul className="ss-partner-events">{events.map(event => <li key={event.id}>
                <ClayIcon name={EVENT_KINDS[event.kind].icon} size={32} />
                <div><strong>{event.title}</strong><span>{EVENT_KINDS[event.kind].label}</span><time dateTime={`${event.date}T${event.start}`}>{event.date} · {event.start}</time></div>
                <button type="button" className="ss-partner-remove" aria-label={`Remove ${event.title}`} onClick={() => save('events', events.filter(value => value.id !== event.id))}><X size={18} aria-hidden="true" /></button>
            </li>)}</ul>}
            <form onSubmit={submitEvent => {
                submitEvent.preventDefault();
                if (events.length >= MAX_EVENTS) return;
                save('events', [...events, { ...event, id: crypto.randomUUID() }]);
                setEvent(EMPTY_EVENT);
            }}>
                <fieldset className="ss-partner-event-fields" disabled={events.length >= MAX_EVENTS}>
                    <legend>Add an event</legend>
                    <label>Event title<input type="text" required maxLength={60} pattern=".*\S.*" value={event.title} onChange={event => edit('events', setEvent, { title: event.target.value })} /></label>
                    <label>Event kind<select value={event.kind} onChange={event => edit('events', setEvent, { kind: event.target.value })}>
                        {Object.entries(EVENT_KINDS).map(([key, kind]) => <option key={key} value={key}>{kind.label}</option>)}
                    </select></label>
                    <div className="ss-partner-form-row">
                        <label>Event date<input type="date" required min={today} max={maxDate} value={event.date} onChange={event => edit('events', setEvent, { date: event.target.value })} /></label>
                        <label>Event starts<input type="time" required value={event.start} onChange={event => edit('events', setEvent, { start: event.target.value })} /></label>
                    </div>
                    <button type="submit" className="ss-partner-button">Add event</button>
                </fieldset>
            </form>
            {events.length >= MAX_EVENTS && <p className="ss-partner-help">Remove an event to add another.</p>}
            {confirmation('events')}
        </section>

        <section className="ss-partner-card ss-partner-tools-card" aria-labelledby="partner-access-heading">
            <Heading id="partner-access-heading" icon="wheelchair">Access facts</Heading>
            <form onSubmit={event => { event.preventDefault(); save('access', { ...access,
                access_entry_steps: numberOrNull(access.access_entry_steps), access_toilet_distance_m: numberOrNull(access.access_toilet_distance_m) }); }}>
                {ACCESS_CHOICES.map(([key, label]) => <Choice key={key} label={label} value={access[key] ?? null} unsure onChange={value => edit('access', setAccess, { [key]: value })} />)}
                <label>Entry steps<input type="number" min={0} max={200} step={1} value={access.access_entry_steps ?? ''} onChange={event => edit('access', setAccess, { access_entry_steps: event.target.value })} /></label>
                <label>Floors served by the lift<input type="text" maxLength={60} value={access.access_lift_floors ?? ''} onChange={event => edit('access', setAccess, { access_lift_floors: event.target.value })} /></label>
                <label>Toilet level<select value={access.access_toilet_level ?? ''} onChange={event => edit('access', setAccess, { access_toilet_level: event.target.value })}>
                    <option value="">Not sure</option><option value="same floor">Same floor</option><option value="upstairs">Upstairs</option><option value="downstairs">Downstairs</option>
                </select></label>
                <label>Toilet distance (metres)<input type="number" min={0} max={500} step={1} value={access.access_toilet_distance_m ?? ''} onChange={event => edit('access', setAccess, { access_toilet_distance_m: event.target.value })} /></label>
                {actions('access', () => { setAccess({}); save('access', null); })}
            </form>
            {confirmation('access')}
        </section>

        <section className="ss-partner-card ss-partner-tools-card" aria-labelledby="partner-outdoor-heading">
            <Heading id="partner-outdoor-heading" icon="garden-table">Outdoor setup</Heading>
            <form onSubmit={event => { event.preventDefault(); save('outdoor', { ...outdoor, seats: numberOrNull(outdoor.seats) }); }}>
                <label>Outdoor seats<input type="number" min={0} max={2000} step={1} value={outdoor.seats ?? ''} onChange={event => edit('outdoor', setOutdoor, { seats: event.target.value })} /></label>
                {OUTDOOR_CHOICES.map(([key, label]) => <Choice key={key} label={label} value={outdoor[key] ?? null} onChange={value => edit('outdoor', setOutdoor, { [key]: value })} />)}
                <p className="ss-partner-help">Describe what you have. This does not say heaters are on.</p>
                {actions('outdoor', () => { setOutdoor({}); save('outdoor', null); })}
            </form>
            {confirmation('outdoor')}
        </section>
    </>;
}
