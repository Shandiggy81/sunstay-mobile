import { useMemo } from 'react';
import ClayIcon from './common/ClayIcon.jsx';
import DataBadge from './DataBadge.jsx';
import SunWindowsGraph from './SunWindowsGraph.jsx';
import { useVenueSunProfile } from '../hooks/useVenueSunProfile.js';
import { calculateBalconySunDay, DEFAULT_TIME_ZONE, venueLocalDate } from '../utils/balconySunEngine.js';
import { outdoorSunDay } from '../utils/sunMoments.js';
import { cardSunWindows } from '../utils/sunWindowsCard.js';
import { sunSourceConfidence } from '../utils/sunSourceConfidence.js';
import { partnerOutdoorSpace } from '../utils/partnerVenueControls.js';
import { roomSunOptions } from '../utils/stayRanking.js';

/** The same engine and provenance as the guest card; no geometry means no graph. */
export default function PartnerSunToday({ venue, now }) {
    const { horizon, geometryConfidence } = useVenueSunProfile(venue.id);
    const space = partnerOutdoorSpace(venue);
    const timeZone = venue.timeZone ?? venue.timezone ?? DEFAULT_TIME_ZONE;
    let date;
    try { date = venueLocalDate(now, timeZone); } catch { /* Hide invalid venue data. */ }
    const room = space?.room;
    const daily = useMemo(() => {
        if (!date || !space || venue.lat == null || venue.lng == null || venue.lat === '' || venue.lng === '') return null;
        try {
            if (space.communal) return null;
            if (room) return calculateBalconySunDay({ ...roomSunOptions(venue, room), date });
            if (!horizon || space.communal || space.label === 'balcony') return null;
            return outdoorSunDay({ lat: Number(venue.lat), lng: Number(venue.lng), horizon, date, timeZone });
        } catch { return null; }
    }, [date, room, horizon, venue, timeZone, space?.label]);
    const sun = useMemo(() => cardSunWindows(daily), [daily]);
    if (!sun) return null;
    const source = room ? { kind: 'estimated', basis: 'Room orientation and shading', line: 'Estimated from room geometry · Low confidence' }
        : sunSourceConfidence({ horizon, geometryConfidence, dataSource: venue.data_source });
    return <section className="ss-partner-card" aria-labelledby="partner-sun-heading">
        <div className="ss-partner-section-heading"><ClayIcon name={space.icon} size={56} /><div>
            <h3 id="partner-sun-heading">Your sun today</h3>
            <p>{room ? `${room.name} · ${room.hasBalcony ? 'balcony' : 'outdoor'} facade` : `${space.label.charAt(0).toUpperCase() + space.label.slice(1)} · venue’s mapped point`}</p>
        </div></div>
        {source && <div className="ss-partner-source"><DataBadge kind={source.kind} source={source.basis} /><p>{source.line}</p></div>}
        <SunWindowsGraph {...sun} now={now} footer={room ? 'Modelled facade exposure. Outdoor access and shading need venue confirmation.' : 'Awnings, umbrellas and trees aren’t included, so covered tables may get less sun.'} />
    </section>;
}
