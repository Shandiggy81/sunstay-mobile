import { forwardRef, useId } from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import DataBadge from './DataBadge.jsx';
import { FACADE_TRUST_LINE } from '../utils/stayRoomTypes.js';
import {
    GARDEN_CHOICES, OUTDOOR_CHOICES, POOL_CHOICES, ROOM_NAME_MAX, compareRoomTypes, homeOutdoorView,
    sharedPoolView, sideSun, stayDateLabel, staySides,
} from '../utils/partnerStay.js';

const LONG_DATE = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const longDate = date => LONG_DATE.format(new Date(`${date}T12:00:00Z`));

/** The stay-type heading: the chosen date, the heading, and the Preview only pill (as Today has). */
function StayHead({ headingId, heading, date, help }) {
    return <>
        <div className="ss-partner-check-head">
            <div><p className="ss-partner-today-date">{longDate(date)}</p><h3 id={headingId}>{heading}</h3></div>
            <span className="ss-partner-preview-pill ss-chip ss-chip--preview">Preview only</span>
        </div>
        <p className="ss-partner-help">{help}</p>
    </>;
}

function StayDate({ value, range, onChange }) {
    const id = useId();
    return <div className="ss-partner-stay-date">
        <ClayIcon name="sun-calendar" size={32} />
        <label htmlFor={id}>Date to check</label>
        <input id={id} type="date" required min={range.today} max={range.max} value={value}
            onChange={event => { if (event.target.value) onChange(event.target.value); }} />
    </div>;
}

/** Yes/no rows as pressed buttons, like the partner tools' choices. */
function Choices({ legend, choices, value, onChange, unsure = 'Not sure', firstRef }) {
    return <fieldset className="ss-partner-choice"><legend>{legend}</legend><div>
        {[...choices, ...(unsure ? [{ id: null, label: unsure }] : [])].map((choice, index) =>
            <button key={choice.label} ref={index === 0 ? firstRef : undefined} type="button" aria-pressed={value === choice.id}
                onClick={() => onChange(choice.id)}>{choice.label}</button>)}
    </div></fieldset>;
}

function SunMoments({ sun }) {
    return <ul className="ss-partner-compare-moments">
        <li data-yes={sun.morning || undefined}>{sun.morning ? 'Morning sun' : 'No morning sun'}</li>
        <li data-yes={sun.sunset || undefined}>{sun.sunset ? 'Sun before sunset' : sun.sunset === false ? 'No sun before sunset' : 'Sunset not known'}</li>
    </ul>;
}

function Unknowns({ items }) {
    if (!items.length) return null;
    return <div className="ss-partner-unknowns"><p>Not known yet</p><ul>{items.map(item => <li key={item}>{item}</li>)}</ul></div>;
}

/** "Room name not set · A and B": the same gap in both room types is said once. */
function mergedUnknowns(rows) {
    const byText = new Map();
    for (const row of rows) for (const item of row.unknowns) byText.set(item, [...(byText.get(item) ?? []), row.key]);
    return [...byText].map(([item, keys]) => `${item} · ${keys.join(' and ')}`);
}

/**
 * Hotel and serviced-apartment first screen: two of the property's room types
 * on one date (Airbnb's listing comparison, Jobber's next-visit card). The sun
 * is the balcony engine's, on the modelled side each room type is placed on.
 */
export const PartnerRoomSun = forwardRef(function PartnerRoomSun({ venue, date, range, rooms, editorOpen, onEditor, onDate, onRoom }, nameRef) {
    const compared = compareRoomTypes({ venue, rooms, date });
    const sides = staySides(venue);
    if (!sides.length) {
        return <section className="ss-partner-today ss-partner-stay" aria-labelledby="partner-stay-heading">
            <StayHead headingId="partner-stay-heading" heading="Room sun" date={date} help="Changes stay on this device until partner editing launches." />
            <article className="ss-partner-service" aria-labelledby="partner-compare-heading">
                <p className="ss-partner-service-kicker">{compared.dateLabel}</p>
                <h4 id="partner-compare-heading">No sides of your building are modelled yet</h4>
                <p className="ss-partner-service-span">Room sun needs the building’s outline. We won’t guess it.</p>
            </article>
        </section>;
    }
    return <section className="ss-partner-today ss-partner-stay" aria-labelledby="partner-stay-heading">
        <StayHead headingId="partner-stay-heading" heading="Room sun" date={date}
            help="Compare two of your room types on one date. Changes stay on this device until partner editing launches." />
        <StayDate value={date} range={range} onChange={onDate} />
        <article className="ss-partner-service ss-partner-compare" aria-labelledby="partner-compare-heading">
            <p className="ss-partner-service-kicker">Direct sun · {compared.dateLabel}</p>
            <h4 id="partner-compare-heading">{compared.verdict ?? 'Put each room type on its side'}</h4>
            <div className="ss-partner-compare-grid">
                {compared.rows.map(row => <section key={row.key} className="ss-partner-compare-room" aria-label={`${row.name}, ${row.sideLabel ?? 'side not set'}`}>
                    <p className="ss-partner-compare-name">{row.name}</p>
                    <p className="ss-partner-compare-side">{row.sideLabel ?? 'Side not set'}</p>
                    <p className="ss-partner-compare-total">{row.sun ? row.sun.durationText : '–'}</p>
                    <p className="ss-partner-compare-label">{row.sunLabel}</p>
                    {row.sun ? <><p className="ss-partner-compare-windows">{row.sun.windowsText}</p><SunMoments sun={row.sun} /></> : null}
                </section>)}
            </div>
            <Unknowns items={mergedUnknowns(compared.rows)} />
            <div className="ss-partner-service-source"><DataBadge kind="estimated" source="Building footprint and neighbours" /><span>{FACADE_TRUST_LINE}</span></div>
            <button type="button" className="ss-partner-button ss-partner-button--soft ss-partner-compare-edit" aria-expanded={editorOpen}
                aria-controls="partner-room-types" onClick={() => onEditor(!editorOpen)}>{editorOpen ? 'Done editing room types' : 'Edit room types'}</button>
        </article>
        <div id="partner-room-types" className="ss-partner-rooms" hidden={!editorOpen}>
            {compared.rows.map((row, index) => <fieldset key={row.key} className="ss-partner-card ss-partner-tools-card ss-partner-room-fields">
                <legend>Room type {row.key}</legend>
                <label>Room name<input ref={index === 0 ? nameRef : undefined} type="text" maxLength={ROOM_NAME_MAX} autoComplete="off"
                    placeholder={index === 0 ? 'e.g. King room' : 'e.g. Twin room'} value={rooms[index].name}
                    onChange={event => onRoom(index, { name: event.target.value })} /></label>
                <label>Side of the building<select value={rooms[index].sideId ?? ''} onChange={event => onRoom(index, { sideId: event.target.value || null })}>
                    <option value="">Not set</option>
                    {sides.map(side => <option key={side.id} value={side.id}>{side.label} · {sideSun(venue, side, date)?.durationText ?? 'not modelled'}</option>)}
                </select></label>
                <Choices legend="Outdoor space" choices={OUTDOOR_CHOICES} value={rooms[index].outdoor} onChange={outdoor => onRoom(index, { outdoor })} />
            </fieldset>)}
            <p className="ss-partner-save-status" role="status">Saved on this device · Preview only</p>
        </div>
    </section>;
});

/** The shared pool, on its own card so its sun is never read as a room's. */
export function PartnerPool({ venue, date, answer, onAnswer, firstRef }) {
    const view = sharedPoolView({ venue, answer, date });
    return <section className="ss-partner-card ss-partner-pool" aria-labelledby="partner-pool-heading">
        <div className="ss-partner-section-heading"><ClayIcon name="umbrella" size={40} /><div>
            <h3 id="partner-pool-heading">Shared pool</h3><p>Kept apart from your room types</p>
        </div></div>
        <p className="ss-partner-pool-status" data-status={view.status}>{answer ? <strong>{view.title}</strong> : null} {view.text}</p>
        {view.unknowns.length ? <p className="ss-partner-unknown-line">Not known yet: {view.unknowns.join(' · ')}</p> : null}
        <Choices legend="Is there a pool for guests?" choices={POOL_CHOICES} value={answer} onChange={onAnswer} firstRef={firstRef} />
    </section>;
}

/**
 * Short-stay first screen: one home and its outdoor areas on a date. The
 * private balcony's sun is calculated; a shared area's isn't, because where it
 * is hasn't been recorded, and the screen says so.
 */
export function PartnerHome({ venue, date, range, garden, onDate, onGarden, gardenRef }) {
    const view = homeOutdoorView({ venue, garden, date });
    const area = view.private;
    return <section className="ss-partner-today ss-partner-stay" aria-labelledby="partner-stay-heading">
        <StayHead headingId="partner-stay-heading" heading="Your home" date={date}
            help="Check your home’s outdoor areas for a date. Changes stay on this device until partner editing launches." />
        <StayDate value={date} range={range} onChange={onDate} />
        <article className="ss-partner-service" aria-labelledby="partner-home-heading">
            <p className="ss-partner-service-kicker">Private · only these guests · {stayDateLabel(date)}</p>
            <h4 id="partner-home-heading">{area ? `${area.title}${area.sun ? ` · ${area.sun.durationText} of sun` : ''}` : 'No private outdoor area recorded'}</h4>
            {area ? <>
                <p className="ss-partner-service-span">{area.sideLabel ?? 'Side not recorded'}</p>
                {area.sun ? <div className="ss-partner-service-weather">
                    <ClayIcon name="sunny-balcony" size={40} />
                    <div><p>{area.sun.windowsText}</p><SunMoments sun={area.sun} /></div>
                </div> : <p className="ss-partner-service-detail">Sun not modelled: the balcony’s side isn’t recorded.</p>}
                <div className="ss-partner-service-source"><DataBadge kind="estimated" source="Building footprint and neighbours" /><span>{FACADE_TRUST_LINE}</span></div>
            </> : <p className="ss-partner-service-span">Your listing doesn’t mention a balcony or outdoor area of the home’s own.</p>}
        </article>
        {view.shared.length ? <article className="ss-partner-card ss-partner-shared" aria-labelledby="partner-shared-heading">
            <h4 id="partner-shared-heading">Other outdoor areas</h4>
            <ul>{view.shared.map(entry => <li key={entry.title}><ClayIcon name="garden" size={32} /><div>
                <strong>{entry.title}</strong><span>{entry.private ? 'Only these guests' : 'Shared with other residents'} · {entry.text}</span>
            </div></li>)}</ul>
        </article> : null}
        {view.ask ? <div className="ss-partner-card ss-partner-garden" ref={gardenRef}>
            <Choices legend={view.ask.question} choices={GARDEN_CHOICES} value={garden} onChange={onGarden} />
        </div> : null}
        <Unknowns items={view.unknowns} />
    </section>;
}
