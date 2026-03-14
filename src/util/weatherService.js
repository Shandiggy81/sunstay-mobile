// src/util/weatherService.js — MUST exist
export async function getMelbourneWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=-37.8136&longitude=144.9631&hourly=uv_index,direct_radiation,sunshine_duration,temperature_2m&daily=sunrise,sunset,uv_index_max&timezone=Australia%2FMelbourne&forecast_days=1`;
  const res = await fetch(url);
  const data = await res.json();
  
  const now = new Date();
  const currentHour = now.getHours();
  
  return {
    temperature: Math.round(data.hourly.temperature_2m[currentHour]),
    uvIndex: data.hourly.uv_index[currentHour],
    sunshineMinsThisHour: data.hourly.sunshine_duration[currentHour] / 60,
    sunScore: Math.min(100, Math.round(data.hourly.direct_radiation[currentHour] / 8))
  };
}
