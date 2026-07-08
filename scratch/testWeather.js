import fs from 'fs';
import { fetchOpenMeteoWeather } from '../src/utils/weatherService.js';

async function test() {
  try {
    const data = await fetchOpenMeteoWeather(-37.8136, 144.9631, new AbortController().signal);
    fs.writeFileSync('./weather_test_output.json', JSON.stringify(data.hourly, null, 2));
    console.log('Success, wrote to weather_test_output.json');
  } catch(e) {
    console.error(e);
  }
}
test();
