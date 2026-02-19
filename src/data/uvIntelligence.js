/**
 * UV Intelligence Engine
 * ─────────────────────────────────────────────────
 * Provides UV index classification, safety messaging,
 * sun protection advice, and best times for sun safety.
 */

export const UV_SCALE = {
    LOW: { min: 0, max: 2, label: 'Low', color: 'text-green-500', bgColor: 'bg-green-50', barColor: 'bg-green-500', advice: 'Safe all day' },
    MODERATE: { min: 3, max: 5, label: 'Moderate', color: 'text-yellow-600', bgColor: 'bg-yellow-50', barColor: 'bg-yellow-500', advice: 'Seek shade midday' },
    HIGH: { min: 6, max: 7, label: 'High', color: 'text-orange-600', bgColor: 'bg-orange-50', barColor: 'bg-orange-600', advice: 'Sunscreen essential' },
    VERY_HIGH: { min: 8, max: 10, label: 'Very High', color: 'text-red-600', bgColor: 'bg-red-50', barColor: 'bg-red-600', advice: 'Extra protection needed' },
    EXTREME: { min: 11, max: 100, label: 'Extreme', color: 'text-purple-700', bgColor: 'bg-purple-50', barColor: 'bg-purple-700', advice: 'Avoid sun 11am-4pm' },
};

export const getUVConfig = (uvi) => {
    if (uvi <= 2) return UV_SCALE.LOW;
    if (uvi <= 5) return UV_SCALE.MODERATE;
    if (uvi <= 7) return UV_SCALE.HIGH;
    if (uvi <= 10) return UV_SCALE.VERY_HIGH;
    return UV_SCALE.EXTREME;
};

/**
 * Provides sun protection advice based on venue features and UV index
 */
export const getSunProtectionAdvice = (venue, uvi) => {
    const config = getUVConfig(uvi);
    const hasShade = venue.tags?.some(tag => ['Shade', 'Shaded', 'Garden', 'Covered'].includes(tag));
    const hasUmbrellas = venue.tags?.some(tag => ['Umbrellas', 'Beer Garden'].includes(tag));

    let advice = config.advice;
    let icon = '🌞';
    let detail = '';

    if (uvi >= 3) {
        if (hasShade) {
            icon = '⛱️';
            detail = 'Shaded terrace available';
        } else if (hasUmbrellas) {
            icon = '☂️';
            detail = 'Umbrellas provided';
        } else if (venue.tags?.includes('Indoor')) {
            icon = '🏠';
            detail = 'Indoor seating available';
        } else {
            icon = '🧴';
            detail = 'Limited shade — pack sunscreen';
        }
    } else {
        detail = 'Enjoy the low UV morning';
    }

    return { label: `UV ${Math.round(uvi)} - ${advice}`, detail, icon, color: config.color };
};

/**
 * Recommends best sun-safe times for a venue based on current hour and UV
 * (Simplified assuming UV peaks at 1pm)
 */
export const getBestSunSafeTimes = (venue, uvi) => {
    const currentHour = new Date().getHours();

    if (uvi < 3) return "Safe any time today";

    if (venue.tags?.includes('Shaded') || venue.tags?.includes('Covered')) {
        return "Ideal for any-time visits";
    }

    // Peak UV window
    if (currentHour >= 11 && currentHour <= 16) {
        return "Best after 4:00 PM";
    }

    return "Great before 11:00 AM";
};
