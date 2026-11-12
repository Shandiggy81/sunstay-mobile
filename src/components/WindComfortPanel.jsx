import React, { useId, useMemo, useState } from 'react';
import { ArrowUp, ChevronDown } from 'lucide-react';
import { useWeather } from '../context/WeatherContext';
import { finiteOrNull } from '../utils/finiteOrNull';
import { estimateNoise } from '../utils/noiseExposure';
import { compassPoint } from '../utils/comfortDisplay.js';
import { describeWindExposure } from '../utils/windExposure.js';
import {
    WIND_FACTOR_STEPS, WIND_LEVEL_KEYS, comfortScale, feelsLikeGap, freshMicroclimate,
    hourlyWindColumns, windFactorView, windLevelWord,
} from '../utils/windComfortView.js';
import OutdoorComfortTiles from './OutdoorComfortTiles.jsx';
import ClayIcon from './common/ClayIcon';
import {
    getWindProfile,
    getWindWarning,
    getVenueWindExposure,
    resolveVenueWindFactor,
    calculateApparentTemp,
    getComfortZone,
    generateHourlyForecast,
    getWindTrend,
    getOptimalBookingTime,
} from '../data/windIntelligence';
import './WindComfortPanel.css';

const kmh = ms => (Number.isFinite(ms) ? Math.round(ms * 3.6) : null);

// Shown when there is no usable temperature. The heading stays so the
// section does not appear to lose its content.
const WindComfortUnavailable = () => (
    <section className="ss-wind" aria-label="Wind and comfort">
        <div className="ss-wind__head">
            <ClayIcon name="windsock" size={40} />
            <div>
                <h3 className="ss-wind__title">Wind &amp; comfort</h3>
                <p className="ss-wind__verdict">Forecast data is unavailable for this venue right now.</p>
            </div>
        </div>
    </section>
);

/** A wind direction arrow that points the way the wind is blowing. */
const WindArrow = ({ direction }) => (
    <ArrowUp size={13} aria-hidden="true" className="shrink-0" style={{ transform: `rotate(${direction + 180}deg)` }} />
);

/**
 * Wind and feels-like comfort at one venue. `microclimate` is the venue's
 * microclimate row: its wind shelter is measured from the surrounding buildings
 * and replaces the venue-type estimate. The venue card does not pass it yet,
 * because the list row and the card header still use the venue-type estimate
 * and one card must not show two different winds. Pass it once they do.
 */
const WindComfortPanel = ({ venue, microclimate = null }) => {
    const { weather } = useWeather();
    const [selectedKey, setSelectedKey] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const titleId = useId();
    const stripId = useId();

    const data = useMemo(() => {
        if (!weather || !venue) return null;
        // The weather payload is assembled from several providers: treat every
        // reading as optional so nothing reaches the panel as "NaN°".
        const temp = finiteOrNull(weather.main?.temp);
        if (temp === null) return null;
        const windSpeed = finiteOrNull(weather.wind?.speed) ?? 0;
        const humidity = finiteOrNull(weather.main?.humidity);
        const direction = finiteOrNull(weather.windDirection ?? weather.wind?.deg);
        const gusts = finiteOrNull(weather.windGusts);
        const gustMs = gusts === null ? null : gusts / 3.6;
        const measured = { microclimate: freshMicroclimate(microclimate), measuredDirection: direction };

        const typeProfile = getWindProfile(venue);
        const factor = resolveVenueWindFactor(venue, { direction, ...measured });
        const exposure = getVenueWindExposure(windSpeed, venue, direction, gustMs, measured);
        const warning = getWindWarning(windSpeed, venue, direction, gustMs, measured);
        const apparent = calculateApparentTemp(temp, windSpeed, humidity, typeProfile.shelterFactor, direction, gustMs, venue, measured);
        const hourly = generateHourlyForecast(temp, windSpeed, humidity, venue, direction, gustMs,
            { hourly: weather.hourly, utcOffsetSeconds: weather.utcOffsetSeconds, ...measured });
        const rows = Array.isArray(hourly) ? hourly : [];
        return {
            temp: Math.round(temp),
            humidity: humidity === null ? null : Math.round(humidity),
            feelsLike: apparent === null ? null : Math.round(apparent),
            comfort: getComfortZone(apparent),
            openAirKmh: kmh(windSpeed),
            hereKmh: kmh(exposure.effectiveWindMs),
            gustKmh: exposure.effectiveGustMs > 0 ? kmh(exposure.effectiveGustMs) : null,
            direction: exposure.direction,
            exposure, warning, rows,
            factor: windFactorView({
                ...factor, note: factor.note ?? typeProfile.venueNote,
                illustrative: Boolean(venue.comfortProfilesIllustrative),
            }),
            trend: getWindTrend(rows),
            best: getOptimalBookingTime(rows),
        };
    }, [weather, venue, microclimate]);

    if (!data) return <WindComfortUnavailable />;

    const columns = hourlyWindColumns(data.rows, expanded ? 24 : 12, { feelsLike: data.feelsLike, windKmh: data.hereKmh });
    const selected = columns.find(column => column.key === selectedKey) ?? null;
    const selectedRow = selected ? data.rows.find(row => row.time?.getTime() === selected.key) ?? null : null;
    const activeRow = selectedRow ?? data.rows[0] ?? null;
    const scale = comfortScale(data.feelsLike);
    const from = compassPoint(data.direction);
    const gap = feelsLikeGap(data.temp, data.feelsLike);
    const showNoise = Boolean(venue?.windProfile || venue?.noiseProfile);
    const anyEstimate = columns.some(column => column.estimated);

    return (
        <section className="ss-wind" aria-labelledby={titleId}>
            <div className="ss-wind__head">
                <ClayIcon name={data.warning.level === 'green' ? 'wind-sheltered' : 'windsock'} size={40} />
                <div className="min-w-0">
                    <h3 id={titleId} className="ss-wind__title">Wind &amp; comfort</h3>
                    <p className="ss-wind__verdict"><strong>{data.warning.label} here now.</strong> {data.warning.advice}</p>
                </div>
            </div>

            <dl className="ss-wind__stats">
                <div>
                    <dt>Feels like</dt>
                    <dd className="ss-wind__value">{data.feelsLike === null ? '–' : `${data.feelsLike}°`}</dd>
                    <dd className="ss-wind__stat-note">Air {data.temp}°{data.humidity === null ? '' : ` · ${data.humidity}% humidity`}</dd>
                </div>
                <div>
                    <dt>Wind here</dt>
                    <dd className="ss-wind__value">{data.hereKmh ?? '–'}<span> km/h</span></dd>
                    <dd className="ss-wind__stat-note">
                        {from ? <><WindArrow direction={data.direction} />From {from}</> : 'Direction unknown'}
                        {data.gustKmh !== null ? <span>· gusts {data.gustKmh}</span> : null}
                    </dd>
                </div>
            </dl>

            <div>
                <div
                    className="ss-wind__scale"
                    role="img"
                    aria-label={data.feelsLike === null ? 'Comfort scale unavailable' : `Comfort scale from cold to hot. Feels like ${data.feelsLike}°: ${data.comfort.label.toLowerCase()}.`}
                >
                    {scale.segments.map(segment => (
                        <span key={segment.level} data-level={segment.level} style={{ left: `${segment.start}%`, width: `${segment.end - segment.start}%` }} />
                    ))}
                    {scale.position === null ? null : <i style={{ left: `${scale.position}%` }} />}
                </div>
                <div className="ss-wind__scale-ends" aria-hidden="true"><span>Cold</span><span>Comfortable</span><span>Hot</span></div>
                <p className="ss-wind__text"><strong>{data.comfort.label}.</strong> {data.comfort.advice}{gap ? `. ${gap}.` : '.'}</p>
            </div>

            {data.factor ? (
                <div className="ss-wind__block">
                    <p className="ss-wind__label">How windy this spot gets</p>
                    <p className="ss-wind__factor">{data.factor.headline}</p>
                    <div
                        className="ss-wind__steps"
                        role="img"
                        aria-label={`Wind exposure: ${WIND_FACTOR_STEPS[data.factor.step]}, on a scale from sheltered to funnels wind.`}
                    >
                        {WIND_FACTOR_STEPS.map((step, index) => <span key={step} className={index === data.factor.step ? 'is-on' : undefined} />)}
                    </div>
                    <div className="ss-wind__scale-ends" aria-hidden="true"><span>Sheltered</span><span>Funnels wind</span></div>
                    <p className="ss-wind__text">
                        {data.factor.share}
                        {data.openAirKmh !== null && data.hereKmh !== null ? `: ${data.openAirKmh} km/h in the open is about ${data.hereKmh} km/h here.` : '.'}
                    </p>
                    {data.exposure.tunnel ? <p className="ss-wind__tunnel">{describeWindExposure(data.exposure, 'now')}</p> : null}
                    {data.factor.note ? <p className="ss-wind__text">{data.factor.note}.</p> : null}
                    <p className="ss-wind__source">{data.factor.sourceLabel}</p>
                </div>
            ) : null}

            {showNoise ? (
                <OutdoorComfortTiles wind={null} noise={estimateNoise(venue, activeRow?.time)} hourLabel={activeRow?.label} venue={venue} />
            ) : null}

            <div className="ss-wind__block">
                <div className="ss-wind__hours-head">
                    <p className="ss-wind__label">Hour by hour</p>
                    <ul className="ss-wind__legend" aria-hidden="true">
                        {WIND_LEVEL_KEYS.map(level => <li key={level}><i data-level={level} />{windLevelWord(level)}</li>)}
                    </ul>
                </div>
                {columns.length ? (
                    <>
                        <div id={stripId} className="hourly-scroll ss-wind__strip" role="group" aria-label="Feels-like temperature and wind here for each hour">
                            {columns.map(column => (
                                <button
                                    type="button"
                                    key={column.key}
                                    className={`hourly-item ss-wind__hour${column.isCurrent ? ' is-now' : ''}${column.estimated ? ' is-estimate' : ''}`}
                                    aria-pressed={selectedKey === column.key}
                                    aria-label={column.spoken}
                                    onClick={() => setSelectedKey(current => (current === column.key ? null : column.key))}
                                >
                                    <span className="ss-wind__hour-label">{column.label}</span>
                                    <span className="ss-wind__hour-feels">{column.feelsLike === null ? '–' : `${column.feelsLike}°`}</span>
                                    <span className="ss-wind__bar" data-level={column.level ?? 'none'}><i style={{ height: `${Math.round(column.bar * 100)}%` }} /></span>
                                    <span className="ss-wind__hour-wind">{column.windKmh ?? '–'}</span>
                                </button>
                            ))}
                        </div>
                        <p className="ss-wind__source">
                            Top: feels like. Bars and bottom number: wind here in km/h. {data.trend?.label ? `${data.trend.label}.` : ''}
                            {anyEstimate ? ' Faded hours follow the usual daily pattern because the forecast does not reach them.' : ''}
                        </p>
                        {selected ? (
                            <p className="ss-wind__hour-detail" role="status">
                                <strong>{selected.label === 'Now' ? 'Right now' : `At ${selected.label}`}:</strong>{' '}
                                {selected.feelsLike === null ? 'feels-like unknown' : `feels like ${selected.feelsLike}°`}
                                {Number.isFinite(selectedRow?.temp) ? ` (air ${selectedRow.temp}°)` : ''},{' '}
                                {selected.windKmh === null ? 'wind unknown' : `wind ${selected.windKmh} km/h here${selected.from ? ` from ${selected.from}` : ''}`}
                                {selectedRow?.windExposure?.effectiveGustMs > 0 ? `, gusts ${kmh(selectedRow.windExposure.effectiveGustMs)}` : ''}.{' '}
                                {selected.levelWord}.
                            </p>
                        ) : null}
                        {data.rows.length > 12 ? (
                            <button
                                type="button"
                                onClick={() => setExpanded(value => !value)}
                                aria-expanded={expanded}
                                aria-controls={stripId}
                                className="ss-wind__more"
                            >
                                {expanded ? 'Show less' : 'Show full 24 hours'}
                                <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                        ) : null}
                    </>
                ) : (
                    <p className="ss-wind__text">Hourly forecast data unavailable.</p>
                )}
            </div>

            {data.best ? (
                <div className="ss-wind__block ss-wind__best">
                    <ClayIcon name="clock" size={40} />
                    <div className="min-w-0">
                        <p className="ss-wind__label">Best time to sit outside</p>
                        <p className="ss-wind__factor">{data.best.startLabel ?? '–'} – {data.best.endLabel ?? '–'}</p>
                        <p className="ss-wind__text">{data.best.reason ?? 'Best conditions in the forecast window'}.</p>
                    </div>
                </div>
            ) : null}
        </section>
    );
};

export default WindComfortPanel;
