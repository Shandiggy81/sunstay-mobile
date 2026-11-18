import { forwardRef, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import ClayIcon from './common/ClayIcon.jsx';
import DataBadge from './DataBadge.jsx';
import { useMicroclimateState } from '../context/MicroclimateContext';
import { lookupMicroclimateEntry } from '../utils/microclimate.js';
import { fetchOpenMeteoWeatherWithMeta } from '../utils/weatherService.js';
import { partnerDataStatus, partnerTodayView } from '../utils/partnerToday.js';
import { PARTNER_DAYS } from '../utils/partnerTools.js';
import { partnerSpecialSave } from '../utils/partnerToolsForm.js';

const SOURCE_LINE = {
    set: 'Hours you set in this preview',
    listing: 'Hours from your listing',
    'listing-unconfirmed': 'Hours from your listing, not yet confirmed',
};
const EMPTY_SPECIAL = { days: [], start: '', end: '', deal: '' };

/** The venue point's forecast, fetched the way the guest card's weather is; missing means no advice. */
function useVenueForecast(venue) {
    const [forecast, setForecast] = useState(null);
    const lat = venue?.lat == null || venue.lat === '' ? NaN : Number(venue.lat);
    const lng = venue?.lng == null || venue.lng === '' ? NaN : Number(venue.lng);
    useEffect(() => {
        setForecast(null);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
        const controller = new AbortController();
        fetchOpenMeteoWeatherWithMeta(lat, lng, controller.signal).then(({ data, fetchedAt }) => {
            if (!controller.signal.aborted) setForecast({ lat, lng, data, fetchedAt });
        }).catch(() => { /* Missing forecast means no advice, not a default claim. */ });
        return () => controller.abort();
    }, [lat, lng]);
    return forecast?.lat === lat && forecast.lng === lng ? forecast : null;
}

/** Today: the date and the next service with its weather (Jobber's next-visit card). */
export function PartnerToday({ venue, now, whatsOn = null }) {
    const forecast = useVenueForecast(venue);
    const { byId } = useMicroclimateState();
    const view = partnerTodayView({ venue, forecast: forecast?.data ?? null, now });
    const { service, weather } = view;
    // Each source gets its own status: the forecast by its fetch time, the venue reading by its own.
    const status = partnerDataStatus({ forecastFetchedAt: forecast?.fetchedAt, reading: lookupMicroclimateEntry(byId, venue.id),
        now, timeZone: venue.timeZone ?? venue.timezone });
    return <section className="ss-partner-today" aria-labelledby="partner-today-heading">
        <div className="ss-partner-check-head">
            <div>{view.dateLabel ? <p className="ss-partner-today-date">{view.dateLabel}</p> : null}<h3 id="partner-today-heading">Today</h3></div>
            <span className="ss-partner-preview-pill">Preview only</span>
        </div>
        <p className="ss-partner-help">Changes stay on this device until partner editing launches.</p>

        <article className="ss-partner-service" aria-labelledby="partner-service-heading">
            <p className="ss-partner-service-kicker">Next service</p>
            <h4 id="partner-service-heading">{service ? service.label : 'Hours not set'}</h4>
            {service ? <p className="ss-partner-service-span">{service.span}</p>
                : <p className="ss-partner-service-span">Add your service hours to see your next service and its weather.</p>}
            {service ? <div className="ss-partner-service-weather">
                <ClayIcon name={weather?.icon ?? 'sun-cloud'} size={40} />
                <div>
                    <p>{weather ? weather.text : 'Forecast unavailable right now'}</p>
                    <p className="ss-partner-service-detail">{weather ? weather.detail : 'We won’t guess the weather for this service.'}</p>
                </div>
            </div> : null}
            {view.tip ? <p className="ss-partner-service-tip"><ClayIcon name={view.tip.icon} size={28} /><span><strong>{view.tip.timeLabel}</strong> {view.tip.text}</span></p> : null}
            {service ? <div className="ss-partner-service-source">
                {!view.forecastMissing ? <DataBadge kind="forecast" updatedAt={forecast?.fetchedAt} source="Open-Meteo" /> : null}
                <span>{service.area && service.source !== 'set'
                    ? `${service.area} hours from your listing${service.source === 'listing-unconfirmed' ? ', not yet confirmed' : ''}`
                    : SOURCE_LINE[service.source]}</span>
            </div> : null}
            {status.reading ? <p className="ss-partner-service-reading" data-status={status.reading.status}>
                {status.reading.status === 'fresh' ? <DataBadge kind="calculated" updatedAt={status.reading.updatedAt} source="SunStay venue reading" /> : null}
                <span>{status.reading.text}</span>
            </p> : null}
            {/* Pubs and bars: what's on sits with the next service, one tap from adding it. */}
            {whatsOn ? <div className="ss-partner-service-on">
                <ClayIcon name="live-music" size={28} />
                <p><strong>What’s on</strong> {whatsOn.next ? `${whatsOn.next.title} · ${whatsOn.next.when}` : 'Nothing added yet'}</p>
                <button type="button" className="ss-partner-button ss-partner-button--soft" onClick={whatsOn.onAdd}>{whatsOn.next ? 'Add another' : 'Add an event'}</button>
            </div> : null}
        </article>
    </section>;
}

/** What to do before service (Jobber's To do list). Every row opens the part of the preview that does the job. */
export function PartnerTodoList({ tasks, onTask, heading = 'Before service' }) {
    return <section className="ss-partner-todo-section" aria-labelledby="partner-todo-heading">
        <h3 className="ss-partner-todo-heading" id="partner-todo-heading">{heading}</h3>
        <ul className="ss-partner-todo">{tasks.map(task => <li key={task.key}>
            <button type="button" onClick={() => onTask(task.target)} data-done={task.done || undefined}>
                <ClayIcon name={task.icon} size={32} />
                <span><strong>{task.title}</strong><small>{task.detail}</small></span>
                {task.done ? <Check size={20} aria-label="Done" /> : <ChevronRight size={20} aria-hidden="true" />}
            </button>
        </li>)}</ul>
    </section>;
}

/**
 * The special, saved on this device as it's typed (no Save button), into the
 * same partner tools the guest card's Specials line already reads. Days and
 * times turn it into a happy hour.
 */
export const PartnerSpecialEditor = forwardRef(function PartnerSpecialEditor({ tools, update, placeholder = 'e.g. Mulled wine $12 from 5pm', note = null, icon = 'pint' }, inputRef) {
    const [form, setForm] = useState(() => ({ ...EMPTY_SPECIAL, ...tools?.happyHour,
        days: tools?.happyHour?.days ?? [], start: tools?.happyHour?.start ?? '', end: tools?.happyHour?.end ?? '', deal: tools?.happyHour?.deal ?? '' }));
    const [showTimes, setShowTimes] = useState(() => Boolean(tools?.happyHour?.start));
    const [status, setStatus] = useState({ saved: false, error: null });
    const dirty = useRef(false);
    const formRef = useRef(form);
    formRef.current = form;

    const flush = () => {
        if (!dirty.current) return;
        dirty.current = false;
        const result = partnerSpecialSave(formRef.current);
        if (result.error) { setStatus({ saved: false, error: result.error }); return; }
        update('happyHour', result.save);
        setStatus({ saved: Boolean(result.save), error: null });
    };
    useEffect(() => {
        if (!dirty.current) return undefined;
        const timer = setTimeout(flush, 400);
        return () => clearTimeout(timer);
    });
    // Leaving the panel mid-sentence still keeps the special.
    useEffect(() => () => flush(), []);
    const edit = patch => { dirty.current = true; setForm(previous => ({ ...previous, ...patch })); setStatus(previous => ({ ...previous, saved: false })); };

    return <section className="ss-partner-card ss-partner-tools-card ss-partner-special" aria-labelledby="partner-special-heading">
        <div className="ss-partner-check-head">
            <div className="ss-partner-section-heading"><ClayIcon name={icon} size={40} /><h3 id="partner-special-heading">Special</h3></div>
            <span className="ss-partner-preview-pill">Preview only</span>
        </div>
        {note ? <p className="ss-partner-help ss-partner-special-note">{note}</p> : null}
        <label className="ss-partner-special-label" htmlFor="partner-special-deal">What’s on special?</label>
        <input ref={inputRef} id="partner-special-deal" type="text" maxLength={80} autoComplete="off" value={form.deal}
            placeholder={placeholder} aria-describedby="partner-special-help"
            onChange={event => edit({ deal: event.target.value })} onBlur={flush} />
        <p id="partner-special-help" className="ss-partner-help">{form.deal.trim().length}/80 · shows on your guest card under Specials · saved on this device as you type</p>
        <button type="button" className="ss-partner-button ss-partner-button--soft ss-partner-special-toggle" aria-expanded={showTimes}
            onClick={() => setShowTimes(value => !value)}>{showTimes ? 'Hide days and times' : 'Add days and times (happy hour)'}</button>
        {showTimes ? <div className="ss-partner-special-times">
            <fieldset className="ss-partner-days"><legend>Happy hour days</legend><div>
                {PARTNER_DAYS.map(day => <button type="button" key={day} aria-pressed={form.days.includes(day)}
                    onClick={() => edit({ days: form.days.includes(day) ? form.days.filter(value => value !== day) : [...form.days, day] })}>{day}</button>)}
            </div></fieldset>
            <div className="ss-partner-form-row">
                <label>Starts<input type="time" value={form.start} onChange={event => edit({ start: event.target.value })} onBlur={flush} /></label>
                <label>Ends<input type="time" value={form.end} onChange={event => edit({ end: event.target.value })} onBlur={flush} /></label>
            </div>
        </div> : null}
        {status.error ? <p role="alert" className="ss-partner-form-error">{status.error}</p> : null}
        <div className="ss-partner-special-foot">
            <p role="status" className="ss-partner-save-status">{status.saved ? 'Saved on this device · Preview only' : ''}</p>
            {form.deal || form.days.length || form.start || form.end ? <button type="button" className="ss-partner-button ss-partner-button--soft"
                onClick={() => { dirty.current = false; setForm(EMPTY_SPECIAL); setStatus({ saved: false, error: null }); update('happyHour', null); }}>Clear</button> : null}
        </div>
    </section>;
});
