import { useState, useEffect } from 'react';

export function useOpenAQ(lat, lng) {
  const [aqLabel, setAqLabel] = useState('–');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lat || !lng) return;
    let isMounted = true;
    setLoading(true);

    async function fetchAQ() {
      try {
        // v3 API: find nearest location first
        const locRes = await fetch(`https://api.openaq.org/v3/locations?coordinates=${lat},${lng}&radius=25000&limit=1`);
        if (!locRes.ok) throw new Error('Location fetch failed');
        const locData = await locRes.json();
        
        if (!locData.results || locData.results.length === 0) {
          if (isMounted) setAqLabel('–');
          return;
        }
        
        const locationId = locData.results[0].id;
        
        // Fetch the PM2.5 measurement for the location (parameters_id = 2)
        const measRes = await fetch(`https://api.openaq.org/v3/locations/${locationId}/measurements?limit=1&parameters_id=2`);
        if (!measRes.ok) throw new Error('Measurement fetch failed');
        const measData = await measRes.json();
        
        if (isMounted && measData.results?.length > 0) {
          const pm25 = measData.results[0].value;
          if (pm25 <= 12) setAqLabel('Pristine');
          else if (pm25 <= 35) setAqLabel('Good');
          else if (pm25 <= 55) setAqLabel('Moderate');
          else setAqLabel('Poor');
        } else {
          if (isMounted) setAqLabel('–');
        }
      } catch (error) {
        console.error('OpenAQ failed:', error, { lat, lng });
        if (isMounted) setAqLabel('–');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchAQ();
    return () => { isMounted = false; };
  }, [lat, lng]);

  return { aqLabel, loading };
}
