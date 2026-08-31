import SunCalc from 'suncalc';

export const getVenueSunStatus = (lat, lng, date = new Date()) => {
  const sunPosition = SunCalc.getPosition(date, lat, lng);
  const azimuthDegrees = (sunPosition.azimuth * 180) / Math.PI;
  const altitudeDegrees = (sunPosition.altitude * 180) / Math.PI;

  return {
    azimuth: azimuthDegrees,
    altitude: altitudeDegrees,
    isSunUp: altitudeDegrees > 0
  };
};

export const checkIfShaded = (altitudeDegrees, obstacleHeight, obstacleDistance) => {
  if (altitudeDegrees <= 0) return true;
  const altRad = altitudeDegrees * (Math.PI / 180);
  const shadowLength = obstacleHeight / Math.tan(altRad);
  return shadowLength > obstacleDistance;
};

export const getSunWindow = (lat, lng, obstacleHeight, obstacleDistance, baseDate = new Date()) => {
  let currentTime = new Date(baseDate.getTime());
  
  // Check if currently shaded
  const currentStatus = getVenueSunStatus(lat, lng, currentTime);
  if (checkIfShaded(currentStatus.altitude, obstacleHeight, obstacleDistance)) {
    return null;
  }

  let lastSunnyTime = new Date(currentTime.getTime());
  
  // Loop forward in 15-minute increments for a max of 6 hours (24 iterations)
  for (let i = 0; i < 24; i++) {
    currentTime.setMinutes(currentTime.getMinutes() + 15);
    const status = getVenueSunStatus(lat, lng, currentTime);
    
    if (checkIfShaded(status.altitude, obstacleHeight, obstacleDistance)) {
      break; // Hit a shaded state or sunset
    }
    
    // Update the last known sunny time
    lastSunnyTime = new Date(currentTime.getTime());
  }
  
  return lastSunnyTime;
};
