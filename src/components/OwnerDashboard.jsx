import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { supabase } from '../lib/supabase';

// ── Shared Spinner ──────────────────────────────────────────────────────
const Spinner = () => (
  <motion.div
    className="inline-block rounded-full"
    style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#14B8A6' }}
    animate={{ rotate: 360 }}
    transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
  />
);

// ── Section Heading ─────────────────────────────────────────────────────
const SectionHeading = ({ children }) => (
  <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>{children}</p>
);

// ── Inline Status ────────────────────────────────────────────────────────
const InlineStatus = ({ text, type }) => (
  <AnimatePresence>
    {text && (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        style={{ fontSize: '0.7rem', color: type === 'error' ? '#F87171' : '#34D399', fontWeight: 600, marginLeft: 8 }}
      >{text}</motion.span>
    )}
  </AnimatePresence>
);

// ── Dark Toggle Switch ──────────────────────────────────────────────────
const DarkToggle = ({ label, icon, value, onChange, saving, saved }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {saving && <Spinner />}
      <AnimatePresence>
        {saved && (
          <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ fontSize: '0.75rem' }}>✅</motion.span>
        )}
      </AnimatePresence>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, position: 'relative', border: 'none', cursor: 'pointer',
          background: value ? '#14B8A6' : 'rgba(255,255,255,0.2)', transition: 'background 200ms ease',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'transform 200ms ease', transform: value ? 'translateX(22px)' : 'translateX(2px)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
      </button>
    </div>
  </div>
);

// ── Styled Text Input ─────────────────────────────────────────────────────
const inputStyle = {
  background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px',
  color: '#fff', fontSize: '0.85rem', border: '1px solid rgba(255,255,255,0.2)',
  outline: 'none', width: '100%',
};

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const PRESET_TAGS = [
  'Sunny Terrace', 'Dog Friendly', 'Live Music', 'Late Night',
  'Cosy Inside', 'Rooftop', 'Garden', 'Sports Screens',
  'Firepit', 'BYO', 'Cocktails', 'Family Friendly',
];

const HEATING_FIELDS = [
  { key: 'heatersOn',         label: 'Outdoor Heaters',    icon: '🔆' },
  { key: 'fireplaceOn',       label: 'Fireplace / Fire Pit', icon: '🔥' },
  { key: 'hasUmbrellas',      label: 'Shade Umbrellas',     icon: '⛱️' },
  { key: 'hasWindProtection', label: 'Wind Protection',     icon: '🌬️' },
];

const booleanFromVenue = (currentValue, legacyFallback) => (
  typeof currentValue === 'boolean' ? currentValue : !!legacyFallback
);

// ── Inner modal — rendered inside the Portal ────────────────────
function OwnerDashboardInner({
  venue,
  onClose,
  liveVenueFeatures,
  setLiveVenueFeatures,
  onVenueUpdate,
}) {
  const safeVenue = venue || {};
  const venueId   = safeVenue.id;
  const venueName = safeVenue.name || safeVenue.venueName || 'Venue';

  const defaultHours = {};
  DAYS.forEach(d => {
    const existing = safeVenue?.hours?.[d];
    defaultHours[d] = existing || { open: '08:00', close: '22:00', closed: false };
  });
  const [hours, setHours]             = useState(defaultHours);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursStatus, setHoursStatus] = useState({ text: '', type: '' });

  const [heatingState, setHeatingState] = useState({
    heatersOn:         booleanFromVenue(safeVenue?.heatersOn,         safeVenue?.hasHeaters),
    fireplaceOn:       booleanFromVenue(safeVenue?.fireplaceOn,       safeVenue?.hasFireplace),
    hasUmbrellas:      !!safeVenue?.hasUmbrellas,
    hasWindProtection: !!safeVenue?.hasWindProtection,
  });
  const [heatingSaving, setHeatingSaving] = useState({});
  const [heatingSaved,  setHeatingSaved]  = useState({});

  const [activeTags, setActiveTags] = useState(() => {
    if (Array.isArray(safeVenue.tags)) return safeVenue.tags;
    if (Array.isArray(safeVenue.vibe)) return safeVenue.vibe;
    return safeVenue.vibe ? [safeVenue.vibe] : [];
  });
  const [customTag,  setCustomTag]  = useState('');
  const [vibeSaving, setVibeSaving] = useState(false);
  const [vibeStatus, setVibeStatus] = useState({ text: '', type: '' });

  const timeoutIdsRef = useRef(new Set());
  const scheduleTimeout = useCallback((callback, delay) => {
    const id = setTimeout(() => { timeoutIdsRef.current.delete(id); callback(); }, delay);
    timeoutIdsRef.current.add(id);
    return id;
  }, []);
  useEffect(() => () => { timeoutIdsRef.current.forEach(clearTimeout); timeoutIdsRef.current.clear(); }, []);

  const flashStatus = useCallback((setter, text, type = 'success', duration = 2000) => {
    setter({ text, type });
    scheduleTimeout(() => setter({ text: '', type: '' }), duration);
  }, [scheduleTimeout]);

  // ───────────────────────────────────────────────────────────────────
  // handleSaveHours
  // Guard: bail early if no venueId. If Supabase is unavailable (null
  // client or network/quota error) we still apply the change locally
  // via onVenueUpdate and show a clear warning — we never silently close.
  // ───────────────────────────────────────────────────────────────────
  const handleSaveHours = async () => {
    // Pre-flight guards — no async work starts until these pass
    if (!venueId) {
      console.warn('[OwnerDashboard] handleSaveHours: no venueId, skipping DB write');
      flashStatus(setHoursStatus, 'Saved locally', 'success');
      onVenueUpdate?.({ ...safeVenue, hours });
      return;
    }
    if (!supabase) {
      console.warn('[OwnerDashboard] handleSaveHours: Supabase not initialised, applying local update only');
      onVenueUpdate?.({ ...safeVenue, hours });
      flashStatus(setHoursStatus, 'Saved locally (DB offline)', 'success');
      return;
    }

    setHoursSaving(true);
    // Apply optimistic local update immediately so UI feels instant
    onVenueUpdate?.({ ...safeVenue, hours });
    try {
      const { error } = await supabase.from('venues').update({ hours }).eq('id', venueId);
      if (error) throw error;
      flashStatus(setHoursStatus, '✅ Saved');
    } catch (err) {
      console.error('[OwnerDashboard] handleSaveHours DB error:', err?.message ?? err);
      // Modal stays open; user sees the error and can retry
      flashStatus(setHoursStatus, 'Save failed — please retry', 'error');
    } finally {
      setHoursSaving(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────
  // handleHeatingToggle
  // Guard: bail early if no venueId or no Supabase.
  // On DB error: revert the local toggle so the UI is truthful.
  // ───────────────────────────────────────────────────────────────────
  const handleHeatingToggle = useCallback(async (key, value) => {
    if (!venueId) {
      console.warn('[OwnerDashboard] handleHeatingToggle: no venueId, skipping DB write');
      return;
    }
    if (!supabase) {
      console.warn('[OwnerDashboard] handleHeatingToggle: Supabase not initialised, applying local update only');
      // Apply locally so the UI reflects the toggle even without DB
      setHeatingState(prev => ({ ...prev, [key]: value }));
      if (setLiveVenueFeatures) {
        setLiveVenueFeatures(prev => ({
          ...prev,
          [venueId]: { ...(prev?.[venueId] || {}), [key]: value },
        }));
      }
      onVenueUpdate?.({ [key]: value });
      setHeatingSaved(prev => ({ ...prev, [key]: true }));
      scheduleTimeout(() => setHeatingSaved(prev => ({ ...prev, [key]: false })), 2000);
      return;
    }

    // Optimistic update
    setHeatingState(prev => ({ ...prev, [key]: value }));
    setHeatingSaving(prev => ({ ...prev, [key]: true }));
    if (setLiveVenueFeatures) {
      setLiveVenueFeatures(prev => ({
        ...prev,
        [venueId]: { ...(prev?.[venueId] || {}), [key]: value },
      }));
    }
    onVenueUpdate?.({ [key]: value });
    try {
      const { error } = await supabase.from('venues').update({ [key]: value }).eq('id', venueId);
      if (error) throw error;
    } catch (err) {
      console.error('[OwnerDashboard] handleHeatingToggle DB error:', err?.message ?? err);
      // Revert optimistic update so toggle is truthful
      setHeatingState(prev => ({ ...prev, [key]: !value }));
      if (setLiveVenueFeatures) {
        setLiveVenueFeatures(prev => ({
          ...prev,
          [venueId]: { ...(prev?.[venueId] || {}), [key]: !value },
        }));
      }
    } finally {
      setHeatingSaved(prev  => ({ ...prev, [key]: true }));
      scheduleTimeout(() => setHeatingSaved(prev => ({ ...prev, [key]: false })), 2000);
      setHeatingSaving(prev => ({ ...prev, [key]: false }));
    }
  }, [venueId, supabase, setLiveVenueFeatures, scheduleTimeout, onVenueUpdate]);

  // ───────────────────────────────────────────────────────────────────
  // handleSaveVibe
  // Guard: bail early if no venueId or no Supabase.
  // On DB error: stay open, show error message so user can retry.
  // ───────────────────────────────────────────────────────────────────
  const handleSaveVibe = async () => {
    if (!venueId) {
      console.warn('[OwnerDashboard] handleSaveVibe: no venueId, skipping DB write');
      onVenueUpdate?.({ ...safeVenue, tags: activeTags });
      flashStatus(setVibeStatus, 'Saved locally', 'success');
      return;
    }
    if (!supabase) {
      console.warn('[OwnerDashboard] handleSaveVibe: Supabase not initialised, applying local update only');
      onVenueUpdate?.({ ...safeVenue, tags: activeTags });
      flashStatus(setVibeStatus, 'Saved locally (DB offline)', 'success');
      return;
    }

    setVibeSaving(true);
    // Optimistic local update
    onVenueUpdate?.({ ...safeVenue, tags: activeTags });
    try {
      const { error } = await supabase.from('venues').update({ tags: activeTags }).eq('id', venueId);
      if (error) throw new Error(error.message || JSON.stringify(error));
      flashStatus(setVibeStatus, '✅ Saved');
    } catch (err) {
      console.error('[OwnerDashboard] handleSaveVibe DB error:', err?.message ?? err);
      // Modal stays open; user sees the error inline and can retry
      flashStatus(setVibeStatus, 'Save failed — please retry', 'error');
    } finally {
      setVibeSaving(false);
    }
  };

  const addTag    = (tag) => { if (activeTags.length >= 8 || activeTags.includes(tag)) return; setActiveTags(t => [...t, tag]); };
  const removeTag = (tag) => setActiveTags(t => t.filter(x => x !== tag));
  const handleAddCustomTag = () => {
    const trimmed = customTag.trim().slice(0, 20);
    if (!trimmed || activeTags.includes(trimmed) || activeTags.length >= 8) return;
    setActiveTags(t => [...t, trimmed]);
    setCustomTag('');
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <motion.div
        key="owner-dashboard"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, top: 48,
          zIndex: 9999,
          background: '#1a1a2e',
          borderRadius: '16px 16px 0 0',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drag Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 4, cursor: 'pointer' }} onClick={onClose}>
          <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.3)' }} />
        </div>

        {/* Top Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', margin: 0 }}>{venueName}</h2>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem' }}>Owner Dashboard</span>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={16} color="#F1F5F9" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, WebkitOverflowScrolling: 'touch' }}>

          <section>
            <SectionHeading>🕐 Operating Hours</SectionHeading>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DAYS.map(day => {
                const d = hours[day];
                return (
                  <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 32, fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{DAY_LABELS[day]}</span>
                    <button
                      onClick={() => setHours(h => ({ ...h, [day]: { ...h[day], closed: !h[day].closed } }))}
                      style={{ width: 36, height: 20, borderRadius: 10, position: 'relative', border: 'none', cursor: 'pointer', flexShrink: 0, background: d.closed ? 'rgba(255,255,255,0.15)' : '#14B8A6', transition: 'background 200ms ease' }}
                    >
                      <div style={{ position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 200ms ease', transform: d.closed ? 'translateX(2px)' : 'translateX(18px)', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                    </button>
                    {d.closed ? (
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Closed</span>
                    ) : (
                      <>
                        <input type="time" value={d.open}  onChange={e => setHours(h => ({ ...h, [day]: { ...h[day], open:  e.target.value } }))} style={{ ...inputStyle, width: 90, padding: '4px 8px', fontSize: '0.75rem' }} />
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}>–</span>
                        <input type="time" value={d.close} onChange={e => setHours(h => ({ ...h, [day]: { ...h[day], close: e.target.value } }))} style={{ ...inputStyle, width: 90, padding: '4px 8px', fontSize: '0.75rem' }} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 12 }}>
              <button onClick={handleSaveHours} disabled={hoursSaving} style={{ padding: '8px 20px', borderRadius: 8, background: '#14B8A6', color: '#fff', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer', opacity: hoursSaving ? 0.6 : 1 }}>
                {hoursSaving ? 'Saving...' : 'Save Hours'}
              </button>
              <InlineStatus text={hoursStatus.text} type={hoursStatus.type} />
            </div>
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />

          <section>
            <SectionHeading>🔥 Heating & Comfort</SectionHeading>
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
              Toggling Heaters or Fireplace ON changes your map pin to 🔥 instantly.
            </p>
            {HEATING_FIELDS.map(({ key, label, icon }) => (
              <DarkToggle
                key={key}
                label={label}
                icon={icon}
                value={heatingState[key]}
                onChange={val => handleHeatingToggle(key, val)}
                saving={heatingSaving[key]}
                saved={heatingSaved[key]}
              />
            ))}
          </section>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '16px 0' }} />

          <section>
            <SectionHeading>✨ Your Venue Vibe</SectionHeading>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {activeTags.map(tag => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 999, background: '#14B8A6', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>
                  {tag}
                  <button onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', padding: 0, fontSize: '0.8rem', lineHeight: 1 }}>✕</button>
                </span>
              ))}
              {activeTags.length === 0 && (
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No tags yet — tap below to add</span>
              )}
            </div>
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginBottom: 8, fontWeight: 600 }}>{activeTags.length}/8 tags</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 12 }}>
              {PRESET_TAGS.map(tag => {
                const active = activeTags.includes(tag);
                return (
                  <button key={tag} onClick={() => !active && addTag(tag)} disabled={active || activeTags.length >= 8}
                    style={{ padding: '6px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)', cursor: active ? 'default' : 'pointer', background: active ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)', color: active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)', transition: 'all 150ms ease' }}>
                    {tag}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input type="text" value={customTag} onChange={e => setCustomTag(e.target.value.slice(0, 20))} placeholder="Custom tag..." maxLength={20} onKeyDown={e => e.key === 'Enter' && handleAddCustomTag()} style={{ ...inputStyle, flex: 1 }} />
              <button onClick={handleAddCustomTag} disabled={!customTag.trim() || activeTags.length >= 8}
                style={{ padding: '8px 16px', borderRadius: 8, background: '#14B8A6', color: '#fff', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer', opacity: (!customTag.trim() || activeTags.length >= 8) ? 0.4 : 1 }}>
                Add
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={handleSaveVibe} disabled={vibeSaving}
                style={{ padding: '8px 20px', borderRadius: 8, background: '#14B8A6', color: '#fff', fontWeight: 700, fontSize: '0.75rem', border: 'none', cursor: 'pointer', opacity: vibeSaving ? 0.6 : 1 }}>
                {vibeSaving ? 'Saving...' : 'Save Vibe'}
              </button>
              <InlineStatus text={vibeStatus.text} type={vibeStatus.type} />
            </div>
          </section>

          <div style={{ height: 48 }} />
        </div>
      </motion.div>
    </div>
  );
}

// ── Public export: Portal wrapper ──────────────────────────────────
export default function OwnerDashboard(props) {
  return createPortal(
    <AnimatePresence>
      {props.venue && <OwnerDashboardInner key="owner-dashboard-inner" {...props} />}
    </AnimatePresence>,
    document.body
  );
}
