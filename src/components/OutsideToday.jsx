import React, { useId } from 'react';
import { Sun, Wind } from 'lucide-react';
import { WIND_FACTOR_STEPS } from '../utils/windComfortView.js';
import './OutsideToday.css';

const SUN_LEGEND = [
    ['sun', 'Full sun'], ['part', 'Part sun'], ['shade', 'Shade'], ['cloud', 'Cloud'], ['rain', 'Rain'], ['dark', 'Night'], ['unknown', 'No forecast'],
];
const BAR_MAX_PX = 44;
// 45 km/h at the table fills the lane; anything stronger is drawn at full height.
const barHeight = kmh => (kmh == null ? 0 : Math.max(4, Math.min(BAR_MAX_PX, Math.round((kmh / 45) * BAR_MAX_PX))));

/** The card's headline: sun and wind in one line, for now or the hour the guest picked. */
export function OutsideVerdict({ model }) {
    if (!model?.verdict) return null;
    return (
        <h3 className="ss-outside-verdict" data-outside-verdict={model.verdict.state}>
            <span>{model.whenLabel}</span>
            {model.verdict.headline}
        </h3>
    );
}

/**
 * Today's sun and wind at this venue on one time axis, with a slider that
 * moves the whole app's time of day (the same one the map and list read).
 * `children` is the weather row for the chosen hour, so it sits by the strip.
 *
 * @param {{ model: ReturnType<typeof import('../utils/outsideToday.js').outsideToday>, onSelectMinutes: (minutes: number|null) => void,
 *   shelter?: object|null, children?: React.ReactNode }} props
 */
export default function OutsideToday({ model, onSelectMinutes, shelter = null, children = null }) {
    const headingId = useId();
    const timesId = useId();
    if (!model) return null;
    const { lanes, range, nowHour, selectedHour } = model;
    const present = new Set(lanes.map(lane => (lane.sun === 'dawn' ? 'dark' : lane.sun)));
    const hasEstimates = lanes.some(lane => lane.estimated);
    const hasWind = lanes.some(lane => lane.windKmh != null);
    const pick = hour => onSelectMinutes(hour === nowHour ? null : hour * 60);

    return (
        <section className="ss-outside" aria-labelledby={headingId} data-outside-today style={{ '--ss-outside-cols': lanes.length }}>
            <div className="ss-outside__head">
                <h3 id={headingId}>Today outside</h3>
                <span>{model.isNow ? `${model.timeLabel}, now` : model.timeLabel}</span>
            </div>

            {/* The picture is decoration for a screen reader: the slider's value text and the row below say the same in words. */}
            <div className="ss-outside__chart" aria-hidden="true">
                <div className="ss-outside__lane">
                    <span className="ss-outside__label is-sun"><Sun size={16} strokeWidth={2.4} />Sun</span>
                    <div className="ss-outside__cells">
                        {lanes.map(lane => <i key={lane.hour} data-sun={lane.sun} />)}
                    </div>
                </div>
                {hasWind ? (
                    <div className="ss-outside__lane is-wind">
                        <span className="ss-outside__label"><Wind size={16} strokeWidth={2.4} />Wind</span>
                        <div className="ss-outside__cells is-bars">
                            {lanes.map(lane => (
                                <i key={lane.hour} data-band={lane.windBand ?? undefined} data-estimated={lane.estimated ? '' : undefined}
                                    style={{ height: barHeight(lane.windKmh) }} />
                            ))}
                        </div>
                    </div>
                ) : null}
                <div className="ss-outside__lane is-axis">
                    <span className="ss-outside__label" />
                    <div className="ss-outside__cells">
                        {lanes.map(lane => <span key={lane.hour}>{lane.hour % 3 === 0 ? lane.label : ''}</span>)}
                    </div>
                </div>
                <span className="ss-outside__marker" style={{ '--ss-outside-at': model.marker }} />
            </div>

            <input
                type="range"
                className="ss-outside__slider"
                min={range.start}
                max={range.end}
                step={1}
                value={selectedHour}
                onChange={event => pick(Number(event.target.value))}
                aria-label="Time of day"
                aria-valuetext={model.spoken}
            />

            <div className="ss-outside__foot">
                <ul className="ss-outside__legend">
                    {SUN_LEGEND.filter(([state]) => present.has(state)).map(([state, label]) => (
                        <li key={state}><i data-sun={state} />{label}</li>
                    ))}
                </ul>
                <button type="button" className="ss-outside__now" onClick={() => onSelectMinutes(null)} disabled={model.isNow}>Back to now</button>
            </div>

            {hasWind ? (
                <p className="ss-outside__note">
                    Wind bars: taller and darker is windier.
                    {hasEstimates ? ' Paler bars are estimates, because this venue’s shelter is measured for the wind direction now.' : ''}
                    {model.shadeSource ? '' : ' The buildings around this venue are not mapped yet, so the sun lane shows the sky only.'}
                </p>
            ) : null}

            {children}

            {shelter ? (
                <div className="ss-outside__block" data-outside-shelter>
                    <h3>How windy this spot gets</h3>
                    <p className="ss-outside__strong">{shelter.headline}</p>
                    <div className="ss-outside__steps" role="img"
                        aria-label={`Wind exposure: ${WIND_FACTOR_STEPS[shelter.step]}, on a scale from sheltered to funnels wind.`}>
                        {WIND_FACTOR_STEPS.map((step, index) => <span key={step} className={index === shelter.step ? 'is-on' : ''} />)}
                    </div>
                    <div className="ss-outside__ends" aria-hidden="true"><span>{WIND_FACTOR_STEPS[0]}</span><span>{WIND_FACTOR_STEPS[WIND_FACTOR_STEPS.length - 1]}</span></div>
                    <p className="ss-outside__text">{shelter.share}{shelter.example ? `: ${shelter.example}.` : '.'}</p>
                    {shelter.tunnel ? <p className="ss-outside__strong">{shelter.tunnel}</p> : null}
                    {shelter.note ? <p className="ss-outside__text">{shelter.note}.</p> : null}
                    <p className="ss-outside__note">{shelter.sourceLabel}</p>
                </div>
            ) : null}

            {model.slots.length > 0 ? (
                <div className="ss-outside__block" data-outside-times>
                    <h3 id={timesId}>Good times to sit outside</h3>
                    <ul className="ss-outside__times" aria-labelledby={timesId}>
                        {model.slots.map(slot => (
                            <li key={slot.hour}>
                                <button type="button" onClick={() => pick(slot.hour)} aria-pressed={slot.hour === selectedHour}
                                    className={slot.good ? 'is-good' : ''}>
                                    <strong>{slot.label}</strong>
                                    <span>{slot.words}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <p className="ss-outside__note">Gold outline: in the sun and not windy. Tap a time to see it above.</p>
                </div>
            ) : null}
        </section>
    );
}
