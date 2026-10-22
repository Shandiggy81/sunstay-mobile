import { createWeatherHandler } from './handler.js';

Deno.serve(createWeatherHandler({
  getApiKey: () => Deno.env.get('OPEN_METEO_API_KEY') || '',
}));
