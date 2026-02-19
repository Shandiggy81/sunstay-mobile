import SunCalc from 'suncalc';

/**
 * Orientation-to-time mapping for Melbourne
 */
const ORIENTATION_WINDOWS = {
    "N": { summer: ["08:00", "17:00"], winter: ["09:00", "15:00"], useCase: "Remote work" },
    "NE": { summer: ["08:00", "17:00"], winter: ["09:00", "15:00"], useCase: "Remote work" },
    "NW": { summer: ["08:00", "17:00"], winter: ["09:00", "15:00"], useCase: "Remote work" },
    "E": { summer: ["06:00", "11:00"], winter: ["07:00", "10:00"], useCase: "Morning coffee" },
    "SE": { summer: ["06:00", "11:00"], winter: ["07:00", "10:00"], useCase: "Morning coffee" },
    "S": { summer: ["10:00", "14:00"], winter: ["11:00", "13:00"], useCase: "Shade retreat" },
    "W": { summer: ["14:00", "20:30"], winter: ["13:00", "17:00"], useCase: "Sunset drinks" },
    "SW": { summer: ["14:00", "20:30"], winter: ["13:00", "17:00"], useCase: "Sunset drinks" }
};

const FALLBACK_TIMES = {
    summer: { sunrise: "06:00", sunset: "20:30" },
    winter: { sunrise: "07:30", sunset: "17:15" }
};

function parseTimeString(timeStr) {
    const [hrs, mins] = timeStr.split(':').map(Number);
    return hrs + mins / 60;
}

function getDuration(start, end) {
    return Math.max(0, parseTimeString(end) - parseTimeString(start));
}

/**
 * Estimates sun hours for a room based on orientation and seasonal milestones.
 */
export function estimateSunProfile(orientation, obstructionLevel) {
    const window = ORIENTATION_WINDOWS[orientation] || ORIENTATION_WINDOWS["S"];
    const obstructionMap = { Open: 1.0, Partial: 0.7, Heavy: 0.4 };
    const factor = obstructionMap[obstructionLevel] || 1.0;

    const summerHours = getDuration(window.summer[0], window.summer[1]) * factor;
    const winterHours = getDuration(window.winter[0], window.winter[1]) * factor;

    return {
        summerHours: parseFloat(summerHours.toFixed(1)),
        winterHours: parseFloat(winterHours.toFixed(1)),
        bestSeason: (orientation === "S") ? "Spring/Autumn" : (summerHours > winterHours ? "Summer" : "Winter"),
        peakTime: `${window.summer[0]}–${window.summer[1]}`,
        useCase: window.useCase
    };
}

/**
 * Live prediction for today's sun hours.
 */
export function calculateDynamicToday(lat, lng, orientation, cloudCover = 0, obstructionLevel = "Open") {
    let sunTimes;
    try {
        sunTimes = SunCalc.getTimes(new Date(), lat, lng);
    } catch (e) {
        console.warn("SunCalc failed, using fallback times", e);
        const isSummer = new Date().getMonth() > 8 || new Date().getMonth() < 3;
        const fb = isSummer ? FALLBACK_TIMES.summer : FALLBACK_TIMES.winter;
        // Mocking SunCalc structure for fallback
        const today = new Date();
        const setTime = (timeStr) => {
            const [h, m] = timeStr.split(':');
            const d = new Date(today);
            d.setHours(h, m, 0, 0);
            return d;
        };
        sunTimes = { sunrise: setTime(fb.sunrise), sunset: setTime(fb.sunset) };
    }

    const window = ORIENTATION_WINDOWS[orientation] || ORIENTATION_WINDOWS["S"];
    const obstructionMap = { Open: 1.0, Partial: 0.7, Heavy: 0.4 };
    const factor = obstructionMap[obstructionLevel] || 1.0;

    // Window boundaries for today
    const winStart = parseTimeString(window.summer[0]); // Using summer as base window
    const winEnd = parseTimeString(window.summer[1]);

    const sunrise = sunTimes.sunrise.getHours() + sunTimes.sunrise.getMinutes() / 60;
    const sunset = sunTimes.sunset.getHours() + sunTimes.sunset.getMinutes() / 60;

    // Effective start/end is intersection of orientation window and actual daylight
    const effectiveStart = Math.max(winStart, sunrise);
    const effectiveEnd = Math.min(winEnd, sunset);

    let predictedHours = Math.max(0, effectiveEnd - effectiveStart);

    // Impact of cloud cover (simple reduction)
    predictedHours = predictedHours * (1 - cloudCover * 0.8);
    predictedHours = predictedHours * factor;

    const fmt = (hrs) => {
        const h = Math.floor(hrs);
        const m = Math.round((hrs - h) * 60);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h % 12 || 12;
        return `${h12}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    return {
        predictedHours: parseFloat(predictedHours.toFixed(1)),
        cloudCover,
        optimalWindow: `${fmt(effectiveStart)}–${fmt(effectiveEnd)}`
    };
}
