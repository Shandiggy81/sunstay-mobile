import { useState, useEffect } from 'react';

export function useOpenUV(lat, lng) {
  const [burnTimeMins, setBurnTimeMins] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;
    if (!import.meta.env.VITE_OPENUV_API_KEY) return;
    let isMounted = true;

    fetch(`https://api.openuv.io/api/v1/uv?lat=${lat}&lng=${lng}`, {
      headers: { 'x-access-token': import.meta.env.VITE_OPENUV_API_KEY }
    })
      .then(r => r.json())
      .then(data => {
        const mins = data?.result?.safe_exposure_time?.st3;
        if (isMounted && typeof mins === 'number') setBurnTimeMins(mins);
      })
      .catch(() => {});

    return () => { isMounted = false; };
  }, [lat, lng]);

  return { burnTimeMins };
}
