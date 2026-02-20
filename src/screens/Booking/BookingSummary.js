/**
 * BookingSummary — Booking Race Condition Fix
 * ────────────────────────────────────────────
 * Prevents double-tap booking duplication via:
 *   1. isSubmitting mutex (useRef for synchronous guard)
 *   2. Server-side availability verification before payment
 *   3. Melbourne timezone timestamps
 *
 * @module screens/Booking/BookingSummary
 */

import React, { useState, useRef, useCallback } from 'react';

const MELBOURNE_TZ = 'Australia/Melbourne';
const formatMelbourneTime = (date = new Date()) =>
    new Intl.DateTimeFormat('en-AU', {
        timeZone: MELBOURNE_TZ,
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);

// ── Availability Mock ───────────────────────────────────────────────

/**
 * Verify venue availability on the server BEFORE processing payment.
 * Currently a mock — replace with real API call when backend is ready.
 *
 * @param {string} venueId
 * @param {string} dateISO  - ISO date string (e.g., '2026-02-20')
 * @param {number} guests
 * @returns {Promise<{ available: boolean, reason?: string }>}
 */
const verifyAvailability = async (venueId, dateISO, guests = 1) => {
    // Simulate server round-trip
    await new Promise(resolve => setTimeout(resolve, 300));

    // TODO: Replace with real endpoint
    // POST /api/bookings/verify { venueId, date, guests }
    console.log(
        `[BookingSummary] Verifying availability: venue=${venueId} date=${dateISO} guests=${guests}`
    );

    // Mock: always available (for demo)
    return { available: true };
};

/**
 * Process payment after availability is confirmed.
 *
 * @param {object} bookingPayload
 * @returns {Promise<{ success: boolean, bookingId?: string, error?: string }>}
 */
const processPayment = async (bookingPayload) => {
    // Simulate payment processing
    await new Promise(resolve => setTimeout(resolve, 600));

    console.log('[BookingSummary] Payment processed:', bookingPayload);

    return {
        success: true,
        bookingId: `BK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
};

// ── BookingSummary Component ────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.venue - Selected venue object
 * @param {string} props.date - Selected date (ISO string)
 * @param {number} [props.guests=1] - Number of guests
 * @param {function} [props.onClose] - Close callback
 * @param {function} [props.onSuccess] - Success callback with booking result
 */
const BookingSummary = ({ venue, date, guests = 1, onClose, onSuccess }) => {
    // ── Mutex: prevents double-tap ───────────────────────────────
    const isSubmittingRef = useRef(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── UI State ─────────────────────────────────────────────────
    const [phase, setPhase] = useState('ready'); // ready | verifying | paying | success | error
    const [errorMessage, setErrorMessage] = useState('');
    const [bookingResult, setBookingResult] = useState(null);

    /**
     * Main booking flow: lock → verify → pay → unlock
     */
    const handleConfirmBooking = useCallback(async () => {
        // ── Synchronous mutex check (useRef, not useState) ─────
        if (isSubmittingRef.current) {
            console.warn('[BookingSummary] Blocked duplicate submission');
            return;
        }
        isSubmittingRef.current = true;
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            // Phase 1: Verify availability
            setPhase('verifying');
            const availability = await verifyAvailability(venue.id, date, guests);

            if (!availability.available) {
                throw new Error(
                    availability.reason || 'This venue is no longer available for the selected date.'
                );
            }

            // Phase 2: Process payment
            setPhase('paying');
            const melbourneTimestamp = formatMelbourneTime(new Date());
            const result = await processPayment({
                venueId: venue.id,
                venueName: venue.venueName || venue.name,
                date,
                guests,
                submittedAt: melbourneTimestamp,
                timezone: MELBOURNE_TZ,
            });

            if (!result.success) {
                throw new Error(result.error || 'Payment processing failed. Please try again.');
            }

            // Phase 3: Success
            setPhase('success');
            setBookingResult(result);
            onSuccess?.(result);

        } catch (err) {
            console.error('[BookingSummary] Booking failed:', err.message);
            setPhase('error');
            setErrorMessage(err.message);
        } finally {
            // ── Always unlock ────────────────────────────────────
            isSubmittingRef.current = false;
            setIsSubmitting(false);
        }
    }, [venue, date, guests, onSuccess]);

    // ── Phase-specific button text ───────────────────────────────
    const getButtonText = () => {
        switch (phase) {
            case 'verifying': return '⏳ Checking availability...';
            case 'paying': return '💳 Processing payment...';
            case 'success': return '✅ Booking confirmed!';
            case 'error': return '🔄 Retry booking';
            default: return '☀️ Confirm Booking';
        }
    };

    // ── Render ───────────────────────────────────────────────────
    return (
        <div className="booking-summary" style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h2 style={styles.title}>Booking Summary</h2>
                {onClose && (
                    <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
                        ✕
                    </button>
                )}
            </div>

            {/* Venue Details */}
            <div style={styles.detailsCard}>
                <div style={styles.venueRow}>
                    <span style={styles.emoji}>{venue.emoji}</span>
                    <div>
                        <div style={styles.venueName}>{venue.venueName || venue.name}</div>
                        <div style={styles.venueAddress}>{venue.address}</div>
                    </div>
                </div>
                <div style={styles.metaRow}>
                    <span>📅 {date}</span>
                    <span>👥 {guests} guest{guests > 1 ? 's' : ''}</span>
                </div>
                <div style={styles.timestamp}>
                    🕐 Melbourne time: {formatMelbourneTime()}
                </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
                <div style={styles.errorBanner}>
                    ⚠️ {errorMessage}
                </div>
            )}

            {/* Success Message */}
            {bookingResult && phase === 'success' && (
                <div style={styles.successBanner}>
                    <div>🎉 Booking confirmed!</div>
                    <div style={styles.bookingId}>ID: {bookingResult.bookingId}</div>
                </div>
            )}

            {/* Confirm Button — disabled during submission */}
            <button
                onClick={handleConfirmBooking}
                disabled={isSubmitting || phase === 'success'}
                style={{
                    ...styles.confirmBtn,
                    ...(isSubmitting ? styles.confirmBtnDisabled : {}),
                    ...(phase === 'success' ? styles.confirmBtnSuccess : {}),
                }}
                id="confirm-booking-btn"
            >
                {getButtonText()}
            </button>

            {/* Double-tap guard indicator (dev only) */}
            {isSubmitting && (
                <div style={styles.lockIndicator}>
                    🔒 Submission locked — preventing duplicates
                </div>
            )}
        </div>
    );
};

// ── Styles ──────────────────────────────────────────────────────────

const styles = {
    container: {
        background: 'linear-gradient(135deg, #1e1b2e 0%, #2d2640 100%)',
        borderRadius: '20px',
        padding: '24px',
        color: '#fff',
        maxWidth: '400px',
        margin: '0 auto',
        fontFamily: "'Inter', -apple-system, sans-serif",
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
    },
    title: {
        fontSize: '20px',
        fontWeight: '800',
        letterSpacing: '-0.5px',
        margin: 0,
    },
    closeBtn: {
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        color: '#fff',
        fontSize: '18px',
        borderRadius: '50%',
        width: '32px',
        height: '32px',
        cursor: 'pointer',
    },
    detailsCard: {
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '16px',
    },
    venueRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px',
    },
    emoji: { fontSize: '32px' },
    venueName: { fontWeight: '700', fontSize: '16px' },
    venueAddress: { fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' },
    metaRow: {
        display: 'flex',
        gap: '16px',
        fontSize: '13px',
        color: 'rgba(255,255,255,0.8)',
        marginBottom: '8px',
    },
    timestamp: {
        fontSize: '11px',
        color: 'rgba(255,255,255,0.5)',
    },
    errorBanner: {
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '10px',
        padding: '12px',
        fontSize: '13px',
        color: '#fca5a5',
        marginBottom: '16px',
    },
    successBanner: {
        background: 'rgba(34, 197, 94, 0.15)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: '10px',
        padding: '12px',
        fontSize: '13px',
        color: '#86efac',
        marginBottom: '16px',
        textAlign: 'center',
    },
    bookingId: {
        fontSize: '11px',
        color: 'rgba(134, 239, 172, 0.7)',
        marginTop: '4px',
        fontFamily: 'monospace',
    },
    confirmBtn: {
        width: '100%',
        padding: '14px',
        borderRadius: '14px',
        border: 'none',
        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
        color: '#fff',
        fontWeight: '800',
        fontSize: '15px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        letterSpacing: '0.3px',
    },
    confirmBtnDisabled: {
        background: 'rgba(255,255,255,0.1)',
        cursor: 'not-allowed',
        opacity: 0.7,
    },
    confirmBtnSuccess: {
        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
        cursor: 'default',
    },
    lockIndicator: {
        textAlign: 'center',
        fontSize: '10px',
        color: 'rgba(255,255,255,0.4)',
        marginTop: '8px',
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
    },
};

export default BookingSummary;
