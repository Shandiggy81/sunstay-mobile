import { useState, useEffect } from 'react';

export function useTomorrowRain(lat, lng) {
  const [isRainStartingSoon, setIsRainStartingSoon] = useState(false);
  const [minutesUntilRain, setMinutesUntilRain] = useState(0);

  useEffect(() => {
    if (!lat || !lng) return;

    let isMounted = true;
    
    async function fetchRain() {
      try {
        const apiKey = import.meta.env.VITE_TOMORROW_API_KEY;
        if (!apiKey) {
          console.warn('Tomorrow.io API key missing');
          return;
        }

        const url = `https://api.tomorrow.io/v4/timelines?location=${lat},${lng}&fields=precipitationIntensity&timesteps=1m&units=metric&apikey=${apiKey}`;
        const res = await fetch(url);
        
        if (!res.ok) {
          throw new Error(`Tomorrow.io error: ${res.status}`);
        }
        
        const data = await res.json();
        
        const intervals = data?.data?.timelines?.[0]?.intervals;
        if (!intervals) return;
        
        const nextHour = intervals.slice(0, 60);
        let rainMin = -1;
        
        for (let i = 0; i < nextHour.length; i++) {
          const intensity = nextHour[i].values?.precipitationIntensity || 0;
          if (intensity > 0.1) {
            rainMin = i;
            break;
          }
        }
        
        if (isMounted) {
          if (rainMin > 0) {
            setIsRainStartingSoon(true);
            setMinutesUntilRain(rainMin);
          } else {
            setIsRainStartingSoon(false);
            setMinutesUntilRain(0);
          }
        }
      } catch (err) {
        console.error('Tomorrow.io fetch failed:', err);
        if (isMounted) {
          setIsRainStartingSoon(false);
          setMinutesUntilRain(0);
        }
      }
    }

    fetchRain();
    
    return () => {
      isMounted = false;
    };
  }, [lat, lng]);

  return { isRainStartingSoon, minutesUntilRain };
}
