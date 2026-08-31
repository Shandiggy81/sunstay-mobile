export const fetchVenueWeather = async (lat, lng) => {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,cloud_cover,rain`);
    if (!res.ok) throw new Error('Network response was not ok');
    const data = await res.json();
    
    return {
      cloudCover: data.current.cloud_cover,
      temp: data.current.temperature_2m,
      isRaining: data.current.rain > 0
    };
  } catch (error) {
    console.error("Failed to fetch live weather", error);
    return null;
  }
};
