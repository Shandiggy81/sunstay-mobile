import React from 'react';

const SunTimeline = ({ sunData }) => {
  // Production Safety: Handle missing, partial, or invalid data.
  if (
    !sunData ||
    typeof sunData.startHour !== 'number' ||
    typeof sunData.endHour !== 'number' ||
    sunData.startHour >= sunData.endHour
  ) {
    return null; // Render nothing if data is unusable.
  }

  // Define the timeline's display range (6 AM to 9 PM)
  const timelineStartHour = 6;
  const timelineEndHour = 21;
  const totalHours = timelineEndHour - timelineStartHour;

  // Clamp values to the visual timeline bounds to prevent overflow.
  const clampedStart = Math.max(timelineStartHour, sunData.startHour);
  const clampedEnd = Math.min(timelineEndHour, sunData.endHour);

  // Calculate position and width as percentages.
  const left = ((clampedStart - timelineStartHour) / totalHours) * 100;
  const width = ((clampedEnd - clampedStart) / totalHours) * 100;

  if (width <= 0) {
    return null; // Don't render if the sunny period is outside our timeline.
  }

  return (
    <div className="w-full mt-2">
      <div className="relative w-full h-1.5 bg-gray-200 rounded-full">
        <div
          className="absolute top-0 h-full bg-yellow-400 rounded-full"
          style={{
            left: `${left}%`,
            width: `${width}%`,
          }}
        />
      </div>
    </div>
  );
};

export default SunTimeline;
