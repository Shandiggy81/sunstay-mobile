export function calculateVenueScore(venue: any, weather: any): number {
  let score = 50;

  if (!venue || !weather) return score;

  // Extract weather properties safely
  const rainChance = weather.rainChance ?? weather.precipProb ?? weather.rawWeather?.precipProb ?? 0;
  const temp = weather.temp ?? weather.main?.temp ?? weather.rawWeather?.temp ?? 22;
  const windSpeed = weather.windSpeed ?? weather.wind?.speed ?? weather.rawWeather?.wind ?? 0;
  const uvIndex = weather.uvIndex ?? weather.rawWeather?.uvIndex ?? venue.weatherNow?.uvIndex ?? 0;
  const isPeakUVWindow = weather.isPeakUVWindow ?? weather.is_peak_uv_window ?? false;

  // Extract venue properties safely
  const indoor = venue.indoorPercentage ?? venue.indoor_percentage ?? 0;
  const coveredOutdoor = venue.coveredOutdoor ?? venue.covered_outdoor ?? false;
  const outdoor = venue.outdoorSeating ?? venue.outdoor ?? venue.hasOutdoor ?? false;
  const isRooftop = venue.isRooftop ?? venue.is_rooftop ?? false;

  // Shelter rating (supports 1-10 scale or scaling up the 0-1 windbreak fraction)
  let shelterRating = venue.shelterRating ?? venue.shelter_rating ?? 0;
  if (shelterRating === 0 && venue.shielding?.windbreak != null) {
      shelterRating = venue.shielding.windbreak * 10;
  }

  const hasFireplace = venue.hasFireplace ?? venue.has_fireplace ?? (venue.heating === 'traditional-fireplace' || venue.heating === 'electric-fireplace');
  const hasHeater = venue.hasHeater ?? venue.has_heater ?? (!!venue.heating && venue.heating !== 'no heating');
  const hasAc = venue.hasAC ?? venue.has_ac ?? venue.cooling === 'air-conditioned';

  // RAIN RULES
  if (rainChance > 60) {
    if (indoor >= 80) score += 20;
    if (coveredOutdoor) score += 15;
    if (outdoor && !coveredOutdoor) score -= 25;
  } else if (rainChance > 40) {
    if (indoor >= 80) score += 12;
    if (coveredOutdoor) score += 10;
    if (outdoor && !coveredOutdoor) score -= 15;
  }

  // WIND RULES
  if (windSpeed > 25) {
    if (shelterRating >= 7) score += 12;
    if (isRooftop) score -= 18;
  } else if (windSpeed > 20) {
    if (shelterRating >= 7) score += 8;
    if (isRooftop) score -= 10;
  }

  // TEMPERATURE RULES
  if (temp >= 18 && temp <= 24 && rainChance < 20) {
    if (outdoor) score += 10;
    if (coveredOutdoor) score += 5;
  }

  if (temp < 12 || rainChance > 60) {
    if (hasFireplace) score += 15;
    if (hasHeater) score += 10;
    if (indoor >= 80) score += 8;
  }

  if (temp > 30) {
    if (indoor >= 80) score += 10;
    if (hasAc) score += 5;
  }

  // UV RULES
  if (isPeakUVWindow) {
    if (uvIndex > 8) {
      if (coveredOutdoor) score += 7;
      if (outdoor && !coveredOutdoor) score -= 5;
    }
  }

  // Clamp final score to 0–100
  return Math.max(0, Math.min(100, score));
}

export function getBadge(score: number): string {
  if (score >= 80) return "Perfect Now";
  if (score >= 60) return "Good Choice";
  if (score >= 40) return "Borderline";
  return "Not Ideal";
}

export function getPinColour(score: number): string {
  if (score >= 80) return "#27AE60"; // green
  if (score >= 60) return "#F5A623"; // yellow
  if (score >= 40) return "#E67E22"; // orange
  return "#E74C3C"; // red
}

export function getRecommendation(venue: any, weather: any): string {
  if (!venue || !weather) return "Suitable for current conditions";
  
  const rain = weather.rainChance ?? weather.precipProb ?? weather.rawWeather?.precipProb ?? 0;
  const temp = weather.temp ?? weather.main?.temp ?? weather.rawWeather?.temp ?? 22;
  const windSpeed = weather.windSpeed ?? weather.wind?.speed ?? weather.rawWeather?.wind ?? 0;
  
  const indoor = venue.indoorPercentage ?? venue.indoor_percentage ?? 0;
  const hasFireplace = venue.hasFireplace ?? venue.has_fireplace ?? (venue.heating === 'traditional-fireplace' || venue.heating === 'electric-fireplace');
  const outdoor = venue.outdoorSeating ?? venue.outdoor ?? venue.hasOutdoor ?? false;
  
  let shelterRating = venue.shelterRating ?? venue.shelter_rating ?? 0;
  if (shelterRating === 0 && venue.shielding?.windbreak != null) {
      shelterRating = venue.shielding.windbreak * 10;
  }

  if (rain > 60 && indoor >= 80) return "Perfect shelter from the rain";
  if (temp < 12 && hasFireplace) return "Cosy fireplace — great for today";
  if (temp >= 18 && temp <= 24 && outdoor && rain < 20) return "Great for outdoor seating right now";
  if (windSpeed > 25 && shelterRating >= 7) return "Sheltered from the wind";
  if (temp > 30 && indoor >= 80) return "Cool escape from the heat";
  
  return "Suitable for current conditions";
}
