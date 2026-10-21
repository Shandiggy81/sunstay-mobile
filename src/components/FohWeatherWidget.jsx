import { useEffect, useState } from 'react';
import { fetchOpenMeteoWeather } from '../utils/weatherService.js';
import { partnerWeatherTips } from '../utils/partnerWeatherTips.js';
import ClayIcon from './common/ClayIcon.jsx';
import DataBadge from './DataBadge.jsx';

/** Venue-local forecast tips, confined to the supplied service hours. */
export default function FohWeatherWidget({ venue, hours, now }) {
    const [forecast, setForecast] = useState(null);
    const lat = venue?.lat == null || venue.lat === '' ? NaN : Number(venue.lat);
    const lng = venue?.lng == null || venue.lng === '' ? NaN : Number(venue.lng);
    useEffect(() => {
        setForecast(null);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const controller = new AbortController();
        fetchOpenMeteoWeather(lat, lng, controller.signal).then(data => {
            if (!controller.signal.aborted) setForecast({ lat, lng, data });
        }).catch(() => { /* Missing forecast means no advice, not a default claim. */ });
        return () => controller.abort();
    }, [lat, lng]);
    const tips = partnerWeatherTips({ venue, hours, now, forecast: forecast?.lat === lat && forecast.lng === lng ? forecast.data : null });
    if (!tips.length) return null;
    return <section className="ss-partner-card" aria-labelledby="partner-weather-heading">
        <div className="ss-partner-section-heading"><ClayIcon name="sun-cloud" size={40} /><div>
            <h3 id="partner-weather-heading">Weather for service</h3>
            <p>During your opening hours · venue-local time</p>
        </div></div>
        <DataBadge kind="forecast" source="Open-Meteo" />
        <ul className="ss-partner-tips">{tips.map(tip => <li key={tip.key}>
            <ClayIcon name={tip.icon} size={56} /><p><time dateTime={tip.time}>{tip.timeLabel}</time><span>{tip.text}</span></p>
        </li>)}</ul>
    </section>;
}
