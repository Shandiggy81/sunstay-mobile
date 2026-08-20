import { useState, useEffect } from 'react';

export function useRainRadar() {
    const [radarFrames, setRadarFrames] = useState([]);
    const [error, setError] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        fetch('https://api.rainviewer.com/public/weather-maps.json', { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                const host = data.host;
                const pastFrames = data.radar.past.map(frame => ({
                    id: `radar-${frame.time}`,
                    url: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`
                }));
                setRadarFrames(pastFrames);
            })
            .catch(err => {
                if (err?.name !== 'AbortError') setError(true);
            })
            .finally(() => clearTimeout(timeoutId));

        return () => {
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, []);

    return { radarFrames, error };
}
