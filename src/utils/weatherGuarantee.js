export function getWeatherGuaranteeQuote({ bookingValue = 120, rainProbability = 0, expectedRainMm = 0, cloudCover = 0, isOutdoor = true }) {
  if (!isOutdoor) return null;
  let pct = 0.05;
  if (rainProbability >= 40) pct += 0.02;
  if (rainProbability >= 65) pct += 0.03;
  if (expectedRainMm >= 2)   pct += 0.02;
  if (expectedRainMm >= 8)   pct += 0.03;
  if (cloudCover >= 70)      pct += 0.01;
  pct = Math.min(pct, 0.15);
  const price = Math.max(6, Math.round(bookingValue * pct));
  const riskBand = pct >= 0.12 ? 'High' : pct >= 0.08 ? 'Medium' : 'Low';
  const riskColor = riskBand === 'High' ? '#F87171' : riskBand === 'Medium' ? '#FCD34D' : '#34D399';
  return { price, pct, riskBand, riskColor, trigger: 'If rainfall exceeds 10mm during your booking window, your venue fee is reimbursed automatically. No claims. No cancellation needed.' };
}
