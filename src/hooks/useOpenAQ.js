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
        const params = new URLSearchParams({
          latitude: String(lat),
          longitude: String(lng),
          hourly: 'pm2_5',
          timezone: 'auto',
          forecast_days: '1',
        });
        const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
        if (!res.ok) throw new Error('AQ fetch failed');
        const data = await res.json();
        const values = data?.hourly?.pm2_5?.filter(v => v !== null);
        if (!values?.length) { if (isMounted) setAqLabel('–'); return; }
        const avg = values.slice(0, 8).reduce((a, b) => a + b, 0) / Math.min(8, values.length);
        if (isMounted) {
          if (avg <= 10) setAqLabel('Pristine');
          else if (avg <= 25) setAqLabel('Good');
          else if (avg <= 50) setAqLabel('Moderate');
          else setAqLabel('Poor');
        }
      } catch (e) {
        console.error('AQ Error:', e.message);
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
