// weatherService.js
export async function getMelbourneWeather(lat = -37.8136, lon = 144.9631) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lon}` +
    `&hourly=uv_index,direct_radiation,sunshine_duration,temperature_2m,weathercode` +
    `&daily=sunrise,sunset,uv_index_max,sunshine_duration` +
    `&timezone=Australia%2FMelbourne` +
    `&forecast_days=1`;

  const res = await fetch(url);
  const data = await res.json();

  const now = new Date();
  const currentHour = now.getHours();

  return {
    temperature: Math.round(data.hourly.temperature_2m[currentHour]),
    uvIndex: data.hourly.uv_index[currentHour],
    uvIndexMax: data.daily.uv_index_max[0],
    sunshineMinsThisHour: data.hourly.sunshine_duration[currentHour] / 60,
    directRadiation: data.hourly.direct_radiation[currentHour],
    sunrise: data.daily.sunrise[0],
    sunset: data.daily.sunset[0],
    weatherCode: data.hourly.weathercode[currentHour],
    // Sun score 0-100 based on radiation + UV
    sunScore: Math.min(100, Math.round(
      (data.hourly.direct_radiation[currentHour] / 8) +
      (data.hourly.uv_index[currentHour] * 5)
    ))
  };
}
