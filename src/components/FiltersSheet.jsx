import { useState } from 'react';

const defaultPill = {
  background: '#FFFFFF',
  border: '1px solid #D1D5DB',
  color: '#4A4A4A',
  borderRadius: '999px',
  padding: '6px 14px',
  fontSize: '13px',
  fontWeight: '600',
  cursor: 'pointer',
  margin: '4px',
};

const selectedPill = {
  ...defaultPill,
  background: '#FFF7ED',
  border: '2px solid #F59E0B',
  color: '#92400E',
};

const FILTERS = {
  vibe: ['Bar', 'Cafe', 'Beer Garden', 'Rooftop', 'Park'],
  sun: ['☀️ Sunny Now', '🌅 Golden Hour', '🌤 Sunny This Arvo', '🌧 Rain OK'],
  features: ['Outdoor Seating', 'Dog Friendly', 'Live Music', 'Food Available'],
};

const SECTION_LABELS = {
  vibe: 'Vibe',
  sun: 'Sun Timing',
  features: 'Features',
};

export default function FiltersSheet({ onClose, venueCount, activeFilters, onToggleFilter, onClearAll }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 1001,
          borderRadius: '24px 24px 0 0',
          background: '#FFFDF5',
          padding: '24px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{
          width: '48px', height: '6px', borderRadius: '999px',
          background: '#F59E0B', margin: '0 auto 16px',
          display: 'block', flexShrink: 0, opacity: 1,
        }} />

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '20px', fontWeight: '800', color: '#1A1A1A' }}>Filters</span>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button type="button" onClick={onClearAll}
              style={{ background: 'transparent', border: 'none', color: '#3B82F6', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Clear all
            </button>
            <button type="button" onClick={onClose}
              style={{ background: 'transparent', border: 'none', fontSize: '20px', color: '#1A1A1A', cursor: 'pointer', lineHeight: 1 }}>
              ×
            </button>
          </div>
        </div>

        {/* Filter sections */}
        {Object.entries(FILTERS).map(([section, values]) => (
          <div key={section} style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              {SECTION_LABELS[section]}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {values.map((value) => {
                const isSelected = activeFilters[section]?.includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onToggleFilter(section, value)}
                    style={isSelected ? selectedPill : defaultPill}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Action button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%', marginTop: '24px',
            background: '#F59E0B', color: '#FFFFFF',
            fontWeight: '800', fontSize: '16px',
            borderRadius: '12px', padding: '14px',
            border: 'none', cursor: 'pointer',
          }}
        >
          Show {venueCount ?? 0} Sunny Spots
        </button>
      </div>
    </div>
  );
}
