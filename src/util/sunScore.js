/**
 * Proprietary SunScore Calculation for SunStay
 * 
 * Formula:
 * - Base Hours = (0.6 * summerHours) + (0.4 * winterHours)
 * - Base Score = Math.min(Base Hours * 10, 80)
 * - UseCase Bonus: +10 for "Morning coffee" or "Sunset drinks"
 * - Obstruction Penalty: -10 for "Partial", -20 for "Heavy"
 * - Final Score = Math.max(0, Math.min(100, Base Score + Bonus - Penalty))
 */

export function calculateSunScore(summerHours, winterHours, useCase, obstructionLevel, orientation) {
    // Validation
    const validOrientations = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const verifiedOrientation = validOrientations.includes(orientation) ? orientation : "S";

    const obstructionMap = { Open: 0, Partial: 1, Heavy: 2 };
    const obstruction = obstructionMap[obstructionLevel] || 0;

    // Weighted average of seasonal hours
    const baseHours = (0.6 * summerHours) + (0.4 * winterHours);

    // Convert hours to base score (capped at 80 to leave room for bonuses)
    const baseScore = Math.min(baseHours * 10, 80);

    // Apply bonuses
    const useCaseBonus = ["Morning coffee", "Sunset drinks"].includes(useCase) ? 10 : 0;

    // Apply penalties
    const obstructionPenalty = obstruction * 10;

    const raw = baseScore + useCaseBonus - obstructionPenalty;

    return Math.max(0, Math.min(100, Math.round(raw)));
}

export function getSunScoreLabel(score) {
    if (score >= 80) return { label: 'Exceptional sun', color: 'sun-score-exceptional' };
    if (score >= 60) return { label: 'Great sun', color: 'sun-score-great' };
    if (score >= 40) return { label: 'Moderate sun', color: 'sun-score-moderate' };
    return { label: 'Limited sun', color: 'sun-score-limited' };
}
