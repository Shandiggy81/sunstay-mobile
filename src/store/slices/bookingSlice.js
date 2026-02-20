/**
 * bookingSlice — Weather-Booking State Sync
 * ──────────────────────────────────────────
 * React Context + useReducer pattern (no Redux dependency).
 *
 * Features:
 *   - Centralized booking state
 *   - Weather severity listener via useEffect
 *   - Auto re-checks availability when severity crosses threshold
 *     (e.g., Sunny → Stormy transition)
 *   - previousSeverityRef tracks transitions
 *
 * @module store/slices/bookingSlice
 */

import React, {
    createContext, useContext, useReducer,
    useEffect, useRef, useCallback,
} from 'react';

// ── Weather Severity Levels ─────────────────────────────────────────

/**
 * @typedef {'sunny' | 'cloudy' | 'rainy' | 'stormy'} WeatherSeverity
 */

/** Severity rank for comparison (higher = worse weather) */
const SEVERITY_RANK = {
    sunny: 0,
    cloudy: 1,
    rainy: 2,
    stormy: 3,
};

/**
 * Derive weather severity from OpenWeather data.
 *
 * @param {object | null} weather - OpenWeather API response
 * @returns {WeatherSeverity}
 */
export const getWeatherSeverity = (weather) => {
    if (!weather || !weather.weather?.[0]) return 'sunny';

    const main = weather.weather[0].main.toLowerCase();
    const windSpeed = weather.wind?.speed ?? 0;

    // Stormy: thunderstorm conditions or extreme wind  
    if (main.includes('thunderstorm') || main.includes('tornado') || windSpeed > 20) {
        return 'stormy';
    }

    // Rainy  
    if (main.includes('rain') || main.includes('drizzle') || main.includes('snow')) {
        return 'rainy';
    }

    // Cloudy  
    if (main.includes('cloud') || main.includes('mist') || main.includes('fog') || main.includes('haze')) {
        return 'cloudy';
    }

    return 'sunny';
};

/**
 * Check if a severity transition crosses a concern threshold.
 * Crossing = going from {sunny, cloudy} → {rainy, stormy} or reverse.
 *
 * @param {WeatherSeverity} prev
 * @param {WeatherSeverity} next
 * @returns {boolean}
 */
const hasCrossedThreshold = (prev, next) => {
    if (prev === next) return false;
    const prevRank = SEVERITY_RANK[prev] ?? 0;
    const nextRank = SEVERITY_RANK[next] ?? 0;
    // Threshold is between cloudy (1) and rainy (2)
    return (prevRank <= 1 && nextRank >= 2) || (prevRank >= 2 && nextRank <= 1);
};


// ── Reducer ─────────────────────────────────────────────────────────

const initialState = {
    selectedVenue: null,
    bookingDate: null,
    availability: null,       // { available: boolean, checkedAt: string } | null
    weatherSeverity: 'sunny',
    isChecking: false,
    error: null,
};

/**
 * @param {object} state
 * @param {{ type: string, payload?: any }} action
 * @returns {object}
 */
const bookingReducer = (state, action) => {
    switch (action.type) {
        case 'SET_VENUE':
            return {
                ...state,
                selectedVenue: action.payload,
                availability: null, // reset on venue change
                error: null,
            };

        case 'SET_DATE':
            return {
                ...state,
                bookingDate: action.payload,
                availability: null, // reset on date change
            };

        case 'SET_WEATHER_SEVERITY':
            return { ...state, weatherSeverity: action.payload };

        case 'CHECK_AVAILABILITY_START':
            return { ...state, isChecking: true, error: null };

        case 'CHECK_AVAILABILITY_SUCCESS':
            return {
                ...state,
                isChecking: false,
                availability: {
                    available: action.payload.available,
                    checkedAt: new Date().toISOString(),
                },
            };

        case 'CHECK_AVAILABILITY_FAILURE':
            return {
                ...state,
                isChecking: false,
                availability: null,
                error: action.payload,
            };

        case 'RESET':
            return initialState;

        default:
            return state;
    }
};


// ── Context ─────────────────────────────────────────────────────────

const BookingContext = createContext(null);

/**
 * Hook to access booking state and actions.
 * @returns {{
 *   state: typeof initialState,
 *   selectVenue: (venue: object) => void,
 *   setDate: (date: string) => void,
 *   checkAvailability: () => Promise<void>,
 *   reset: () => void,
 * }}
 */
export const useBooking = () => {
    const ctx = useContext(BookingContext);
    if (!ctx) {
        throw new Error('useBooking must be used within a BookingProvider');
    }
    return ctx;
};


// ── Provider ────────────────────────────────────────────────────────

/**
 * @param {{ children: React.ReactNode, weather?: object | null }} props
 */
export const BookingProvider = ({ children, weather = null }) => {
    const [state, dispatch] = useReducer(bookingReducer, initialState);
    const previousSeverityRef = useRef(state.weatherSeverity);

    // ── Actions ───────────────────────────────────────────────────
    const selectVenue = useCallback((venue) => {
        dispatch({ type: 'SET_VENUE', payload: venue });
    }, []);

    const setDate = useCallback((date) => {
        dispatch({ type: 'SET_DATE', payload: date });
    }, []);

    const reset = useCallback(() => {
        dispatch({ type: 'RESET' });
    }, []);

    /**
     * Check availability for the current venue + date.
     * This is a mock — replace with real API call.
     */
    const checkAvailability = useCallback(async () => {
        if (!state.selectedVenue || !state.bookingDate) return;

        dispatch({ type: 'CHECK_AVAILABILITY_START' });

        try {
            // Mock server-side check
            await new Promise(resolve => setTimeout(resolve, 400));

            // TODO: Replace with real API
            // const result = await api.post('/bookings/check', {
            //   venueId: state.selectedVenue.id,
            //   date: state.bookingDate,
            // });

            const isStormy = state.weatherSeverity === 'stormy';
            const available = !isStormy; // Stormy weather blocks outdoor bookings (demo logic)

            dispatch({
                type: 'CHECK_AVAILABILITY_SUCCESS',
                payload: { available },
            });

            if (!available) {
                console.warn(
                    '[bookingSlice] Venue unavailable due to weather severity:',
                    state.weatherSeverity
                );
            }
        } catch (err) {
            dispatch({
                type: 'CHECK_AVAILABILITY_FAILURE',
                payload: err.message,
            });
        }
    }, [state.selectedVenue, state.bookingDate, state.weatherSeverity]);


    // ── Weather Severity Listener ─────────────────────────────────
    // Re-check availability when weather crosses a threshold

    useEffect(() => {
        const newSeverity = getWeatherSeverity(weather);
        const prevSeverity = previousSeverityRef.current;

        if (newSeverity !== prevSeverity) {
            dispatch({ type: 'SET_WEATHER_SEVERITY', payload: newSeverity });

            // Check if we crossed the concern threshold
            if (hasCrossedThreshold(prevSeverity, newSeverity)) {
                console.log(
                    `[bookingSlice] Weather threshold crossed: ${prevSeverity} → ${newSeverity}. Re-checking availability.`
                );
                // Auto re-check if we have an active booking selection
                if (state.selectedVenue && state.bookingDate) {
                    checkAvailability();
                }
            }

            previousSeverityRef.current = newSeverity;
        }
    }, [weather, state.selectedVenue, state.bookingDate, checkAvailability]);


    // ── Context Value ─────────────────────────────────────────────
    const value = {
        state,
        selectVenue,
        setDate,
        checkAvailability,
        reset,
    };

    return (
        <BookingContext.Provider value={value}>
            {children}
        </BookingContext.Provider>
    );
};

export default BookingProvider;
