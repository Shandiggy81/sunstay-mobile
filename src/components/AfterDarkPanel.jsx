import React, { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import ClayIcon from './common/ClayIcon';
import { EVENT_CATEGORIES, warmPairings } from '../utils/afterDarkEvents.js';
import { afterDarkPriceLabel, afterDarkTitle, displayAfterDarkTitle, eveningForecast, formatAfterDarkTime, showtimeNote, tonightsEvents } from '../utils/afterDarkHome.js';
import { useMinuteNow } from '../hooks/useCafeRowSun.js';
import './AfterDarkPanel.css';

function EventRow({ event, weather, venues, evening }) {
    const category = EVENT_CATEGORIES[event.category];
    const note = showtimeNote(event, weather, evening);
    const pairing = warmPairings(event, venues, { weather })[0];
    const price = afterDarkPriceLabel(event);
    const title = displayAfterDarkTitle(afterDarkTitle(event));
    const time = formatAfterDarkTime(event.start);
    return (
        <article className="ss-after-dark-event" aria-label={title}>
            <time className="ss-after-dark-time" dateTime={event.start} title="Melbourne time">{time}</time>
            <div className="ss-after-dark-event-content">
                <p className="ss-after-dark-category"><ClayIcon name={category.icon} size={20} />
                    <span>{category.label}{event.venueName && <> · {event.venueName}</>}</span>
                </p>
                <h3>{title}</h3>
                {note && <div className="ss-after-dark-forecast">
                    {note.line && <p>{note.line}</p>}
                    {note.advice && <p className="ss-after-dark-advice">{note.advice}</p>}
                </div>}
                {pairing && <p className="ss-after-dark-pairing">
                    <ClayIcon name="indoor-warmth" size={20} />
                    <span>{pairing.line}</span>
                </p>}
                {(event.walkMinutes != null || event.adultsOnly || price || event.ticketUrl) && <div className="ss-after-dark-event-footer">
                    <div className="ss-after-dark-event-facts">
                        {event.walkMinutes != null && <span className="ss-after-dark-when">{`${event.walkMinutes}\u00a0min walk`}</span>}
                        {event.adultsOnly && <span className="ss-after-dark-age">18+</span>}
                        {price && <span className="ss-after-dark-price">{price}</span>}
                    </div>
                    {event.ticketUrl && <a href={event.ticketUrl} target="_blank" rel="noopener noreferrer"
                        aria-label={`Tickets for ${title}, on Ticketmaster`} className="ss-after-dark-tickets">
                        Tickets{' '}<ExternalLink size={16} aria-hidden="true" />
                    </a>}
                </div>}
            </div>
        </article>
    );
}

/** Existing event engine and weather, presented as a list without event map pins. */
export default function AfterDarkPanel({ origin, venues, weather, state, onRetry, onCosy, onLocate, locating = false, locateHint = null }) {
    const [category, setCategory] = useState(null);
    const [freeOnly, setFreeOnly] = useState(false);
    const now = useMinuteNow();
    const events = useMemo(() => tonightsEvents(state.events, {
        now: new Date(now), origin, maxKm: 3, categories: category ? [category] : null, freeOnly,
    }), [state.events, origin, category, freeOnly, now]);
    const evening = useMemo(() => eveningForecast(events, weather), [events, weather]);
    const updated = formatAfterDarkTime(state.fetchedAt);
    const loading = state.status === 'loading' || state.status === 'idle';

    return (
        <section className="ss-after-dark-panel" aria-label="Tonight's events"
            onPointerDownCapture={event => event.stopPropagation()}>
            <div className="ss-after-dark-context">
                <div className="ss-after-dark-origin-row">
                    <p className="ss-after-dark-origin" role="status">{locating ? 'Finding you…' : locateHint ?? origin.label}</p>
                    {onLocate && origin.kind !== 'location' && <button type="button" className="ss-after-dark-locate"
                        onClick={onLocate} disabled={locating}>
                        <ClayIcon name="map-pin" size={22} />Near me
                    </button>}
                </div>
                {evening && <p className="ss-after-dark-evening">{evening.line}</p>}
            </div>
            <div className="ss-after-dark-filters">
                <div className="ss-after-dark-categories" role="group" aria-label="Event category">
                    <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)}>
                        <ClayIcon name="night" size={24} />All
                    </button>
                    {Object.entries(EVENT_CATEGORIES).map(([key, item]) => <button key={key} type="button"
                        aria-pressed={category === key} onClick={() => setCategory(key)}>
                        <ClayIcon name={item.icon} size={24} />{item.label}
                    </button>)}
                    <button type="button" className="ss-after-dark-free" aria-pressed={freeOnly}
                        onClick={() => setFreeOnly(value => !value)}>Free</button>
                </div>
            </div>
            <div className="ss-after-dark-results" aria-busy={loading}>
                {loading ? <div role="status" className="ss-after-dark-loading">
                    <span className="sr-only">Loading tonight's events</span>
                    {[0, 1, 2].map(key => <div className="ss-after-dark-skeleton" key={key} aria-hidden="true">
                        <span className="ss-after-dark-skeleton-time" />
                        <div className="ss-after-dark-event-content"><span /><span /><span /></div>
                    </div>)}
                </div> : state.status === 'error' ? <div className="ss-after-dark-state" role="alert">
                    <ClayIcon name="night" size={48} />
                    <p>Can't load tonight's events right now.</p>
                    <button type="button" onClick={onRetry}>Retry</button>
                </div> : events.length === 0 ? <div className="ss-after-dark-state" role="status">
                    <ClayIcon name="night" size={48} />
                    <p>No shows listed near here tonight.</p>
                    <button type="button" onClick={onCosy}><ClayIcon name="indoor-warmth" size={26} />Cosy spots</button>
                </div> : <div className="ss-after-dark-event-list">
                    {events.map(event => <EventRow key={event.id} event={event} weather={weather} venues={venues} evening={evening} />)}
                </div>}
                <p className="ss-after-dark-source">Events from Ticketmaster{updated && <> · updated <time dateTime={state.fetchedAt} title="Melbourne time">{updated}</time></>}</p>
            </div>
        </section>
    );
}
