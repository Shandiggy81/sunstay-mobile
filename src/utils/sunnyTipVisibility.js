/** Automatic advice waits for usable advice and never interrupts an open chat. */
export function shouldAutoShowSunnyTip({ basis, hasShown, isChatOpen }) {
    return !hasShown && !isChatOpen && (basis === 'live' || basis === 'tip');
}
