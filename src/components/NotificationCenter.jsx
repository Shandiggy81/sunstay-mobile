import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Bell, X, Settings, Heart, Star, ChevronRight,
    Sun, Wind, Thermometer, MapPin, Clock, Volume2, VolumeX,
    Check, Trash2, Filter, Zap, CloudRain
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWeather } from '../context/WeatherContext';
import { demoVenues } from '../data/demoVenues';
import {
    generateNotifications,
    loadPreferences, savePreferences,
    loadNotifications, saveNotifications,
    loadDismissed, saveDismissed,
    NOTIFICATION_CATEGORIES, FREQUENCY_OPTIONS, RADIUS_OPTIONS,
    DEFAULT_PREFERENCES,
} from '../data/notificationEngine';


// ═══════════════════════════════════════════════════════════════════
// Notification Center
// ═══════════════════════════════════════════════════════════════════
export default function NotificationCenter({ onVenueSelect }) {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('notifications'); // 'notifications' | 'settings'
    const [prefs, setPrefs] = useState(() => loadPreferences());
    const [notifications, setNotifications] = useState(() => loadNotifications());
    const [dismissed, setDismissed] = useState(() => loadDismissed());
    const [categoryFilter, setCategoryFilter] = useState(null);
    const panelRef = useRef(null);
    const { weather } = useWeather();

    // Generate new notifications periodically (every 60s)
    useEffect(() => {
        const check = () => {
            const newNotifs = generateNotifications(weather, demoVenues, prefs, dismissed);
            if (newNotifs.length > 0) {
                setNotifications(prev => {
                    const merged = [...newNotifs, ...prev];
                    // Deduplicate
                    const seen = new Set();
                    const deduped = merged.filter(n => {
                        if (seen.has(n.dedupKey)) return false;
                        seen.add(n.dedupKey);
                        return true;
                    });
                    saveNotifications(deduped);
                    return deduped;
                });
            }
        };

        check(); // immediate
        const interval = setInterval(check, 60000);
        return () => clearInterval(interval);
    }, [weather, prefs, dismissed]);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Persist prefs on change
    useEffect(() => { savePreferences(prefs); }, [prefs]);

    // Computed
    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.read).length, [notifications]);

    const filteredNotifs = useMemo(() => {
        if (!categoryFilter) return notifications;
        return notifications.filter(n => n.category === categoryFilter);
    }, [notifications, categoryFilter]);

    // Handlers
    const markRead = useCallback((id) => {
        setNotifications(prev => {
            const updated = prev.map(n => n.id === id ? { ...n, read: true } : n);
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications(prev => {
            const updated = prev.map(n => ({ ...n, read: true }));
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const dismissNotif = useCallback((notif) => {
        setDismissed(prev => {
            const next = new Set(prev);
            next.add(notif.dedupKey);
            saveDismissed(next);
            return next;
        });
        setNotifications(prev => {
            const updated = prev.filter(n => n.id !== notif.id);
            saveNotifications(updated);
            return updated;
        });
    }, []);

    const clearAll = useCallback(() => {
        notifications.forEach(n => {
            setDismissed(prev => {
                const next = new Set(prev);
                next.add(n.dedupKey);
                saveDismissed(next);
                return next;
            });
        });
        setNotifications([]);
        saveNotifications([]);
    }, [notifications]);

    const toggleFavorite = useCallback((venueId) => {
        setPrefs(prev => {
            const favs = prev.favoriteVenueIds.includes(venueId)
                ? prev.favoriteVenueIds.filter(id => id !== venueId)
                : [...prev.favoriteVenueIds, venueId];
            return { ...prev, favoriteVenueIds: favs };
        });
    }, []);

    const updateWeatherPref = useCallback((key, value) => {
        setPrefs(prev => ({
            ...prev,
            weatherPrefs: { ...prev.weatherPrefs, [key]: value },
        }));
    }, []);

    const toggleCategory = useCallback((cat) => {
        setPrefs(prev => ({
            ...prev,
            enabledCategories: {
                ...prev.enabledCategories,
                [cat]: !prev.enabledCategories[cat],
            },
        }));
    }, []);

    const handleNotifAction = useCallback((notif) => {
        markRead(notif.id);
        if (notif.venueId && onVenueSelect) {
            const venue = demoVenues.find(v => v.id === notif.venueId);
            if (venue) onVenueSelect(venue);
        }
        setIsOpen(false);
    }, [markRead, onVenueSelect]);

    // Time formatting
    const formatTime = (iso) => {
        const d = new Date(iso);
        const now = new Date();
        const diffMin = Math.round((now - d) / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.round(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        return d.toLocaleDateString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    };

    const categoryMeta = NOTIFICATION_CATEGORIES;

    return (
        <div className="ss-notif-root" ref={panelRef}>
            {/* ── Bell Button ──────────────────────── */}
            <motion.button
                className="ss-notif-bell"
                onClick={() => setIsOpen(!isOpen)}
                whileTap={{ scale: 0.9 }}
                id="notification-bell"
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <motion.span
                        className="ss-notif-badge"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        key={unreadCount}
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                )}
            </motion.button>

            {/* ── Panel ────────────────────────────── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="ss-notif-panel"
                        initial={{ opacity: 0, y: -10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.96 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                    >
                        {/* Header */}
                        <div className="ss-notif-header">
                            <div className="ss-notif-tabs">
                                <button
                                    className={`ss-notif-tab ${activeTab === 'notifications' ? 'ss-notif-tab--active' : ''}`}
                                    onClick={() => setActiveTab('notifications')}
                                >
                                    <Bell size={14} />
                                    <span>Notifications</span>
                                    {unreadCount > 0 && <span className="ss-notif-tab-count">{unreadCount}</span>}
                                </button>
                                <button
                                    className={`ss-notif-tab ${activeTab === 'settings' ? 'ss-notif-tab--active' : ''}`}
                                    onClick={() => setActiveTab('settings')}
                                >
                                    <Settings size={14} />
                                    <span>Settings</span>
                                </button>
                            </div>
                            <button className="ss-notif-close" onClick={() => setIsOpen(false)}>
                                <X size={16} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="ss-notif-body">
                            <AnimatePresence mode="wait">
                                {activeTab === 'notifications' ? (
                                    <motion.div
                                        key="notifs"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        className="ss-notif-content"
                                    >
                                        <NotificationList
                                            notifications={filteredNotifs}
                                            categoryFilter={categoryFilter}
                                            setCategoryFilter={setCategoryFilter}
                                            markRead={markRead}
                                            markAllRead={markAllRead}
                                            dismissNotif={dismissNotif}
                                            clearAll={clearAll}
                                            handleAction={handleNotifAction}
                                            formatTime={formatTime}
                                            categoryMeta={categoryMeta}
                                        />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="settings"
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        className="ss-notif-content"
                                    >
                                        <SettingsPanel
                                            prefs={prefs}
                                            setPrefs={setPrefs}
                                            toggleFavorite={toggleFavorite}
                                            updateWeatherPref={updateWeatherPref}
                                            toggleCategory={toggleCategory}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}


// ═══════════════════════════════════════════════════════════════════
// Notification List Sub-Component
// ═══════════════════════════════════════════════════════════════════
function NotificationList({
    notifications, categoryFilter, setCategoryFilter,
    markRead, markAllRead, dismissNotif, clearAll,
    handleAction, formatTime, categoryMeta
}) {
    return (
        <>
            {/* Category filter chips */}
            <div className="ss-notif-filters">
                <button
                    className={`ss-notif-filter-chip ${!categoryFilter ? 'ss-notif-filter-chip--active' : ''}`}
                    onClick={() => setCategoryFilter(null)}
                >All</button>
                {Object.entries(categoryMeta).map(([key, meta]) => (
                    <button
                        key={key}
                        className={`ss-notif-filter-chip ${categoryFilter === key ? 'ss-notif-filter-chip--active' : ''}`}
                        onClick={() => setCategoryFilter(key)}
                    >
                        <span>{meta.icon}</span>
                        <span>{meta.label.split(' ')[0]}</span>
                    </button>
                ))}
            </div>

            {/* Actions bar */}
            {notifications.length > 0 && (
                <div className="ss-notif-actions">
                    <button onClick={markAllRead} className="ss-notif-action-btn">
                        <Check size={12} /> Mark all read
                    </button>
                    <button onClick={clearAll} className="ss-notif-action-btn ss-notif-action-btn--danger">
                        <Trash2 size={12} /> Clear all
                    </button>
                </div>
            )}

            {/* Notification items */}
            <div className="ss-notif-items">
                <AnimatePresence mode="popLayout">
                    {notifications.map(notif => (
                        <motion.div
                            key={notif.id}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -100 }}
                            className={`ss-notif-item ${!notif.read ? 'ss-notif-item--unread' : ''}`}
                        >
                            <div className="ss-notif-item-icon" style={{ background: categoryMeta[notif.category]?.color + '18', color: categoryMeta[notif.category]?.color }}>
                                {notif.icon}
                            </div>

                            <div className="ss-notif-item-body" onClick={() => handleAction(notif)}>
                                <div className="ss-notif-item-title">{notif.title}</div>
                                <div className="ss-notif-item-text">{notif.body}</div>
                                <div className="ss-notif-item-meta">
                                    <span className="ss-notif-item-time">{formatTime(notif.time)}</span>
                                    {notif.priority === 'high' && <span className="ss-notif-item-priority">⚡ Priority</span>}
                                </div>
                            </div>

                            <div className="ss-notif-item-actions">
                                {notif.actionLabel && (
                                    <button
                                        className="ss-notif-item-action"
                                        onClick={() => handleAction(notif)}
                                    >
                                        {notif.actionLabel}
                                        <ChevronRight size={12} />
                                    </button>
                                )}
                                <button
                                    className="ss-notif-item-dismiss"
                                    onClick={() => dismissNotif(notif)}
                                    title="Dismiss"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {notifications.length === 0 && (
                    <div className="ss-notif-empty">
                        <span>🔔</span>
                        <p>No notifications yet</p>
                        <p className="ss-notif-empty-sub">
                            Save favorite venues and set your weather preferences to get smart alerts
                        </p>
                    </div>
                )}
            </div>
        </>
    );
}


// ═══════════════════════════════════════════════════════════════════
// Settings Panel Sub-Component
// ═══════════════════════════════════════════════════════════════════
function SettingsPanel({ prefs, setPrefs, toggleFavorite, updateWeatherPref, toggleCategory }) {
    const wpref = prefs.weatherPrefs;

    return (
        <div className="ss-notif-settings">
            {/* ── Weather Preferences ────────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <Thermometer size={14} />
                    Weather Preferences
                </h4>
                <div className="ss-settings-desc">Get notified when conditions match</div>

                <div className="ss-settings-grid">
                    <div className="ss-settings-field">
                        <label>Min Temp</label>
                        <div className="ss-settings-range-row">
                            <input
                                type="range"
                                min="10"
                                max="35"
                                value={wpref.minTemp}
                                onChange={e => updateWeatherPref('minTemp', parseInt(e.target.value))}
                                className="ss-settings-slider"
                            />
                            <span className="ss-settings-value">{wpref.minTemp}°C</span>
                        </div>
                    </div>

                    <div className="ss-settings-field">
                        <label>Max Temp</label>
                        <div className="ss-settings-range-row">
                            <input
                                type="range"
                                min="15"
                                max="42"
                                value={wpref.maxTemp}
                                onChange={e => updateWeatherPref('maxTemp', parseInt(e.target.value))}
                                className="ss-settings-slider"
                            />
                            <span className="ss-settings-value">{wpref.maxTemp}°C</span>
                        </div>
                    </div>

                    <div className="ss-settings-field">
                        <label>Max Wind</label>
                        <div className="ss-settings-range-row">
                            <input
                                type="range"
                                min="5"
                                max="50"
                                step="5"
                                value={wpref.maxWind}
                                onChange={e => updateWeatherPref('maxWind', parseInt(e.target.value))}
                                className="ss-settings-slider"
                            />
                            <span className="ss-settings-value">{wpref.maxWind} km/h</span>
                        </div>
                    </div>

                    <div className="ss-settings-field">
                        <label>Prefer Sunny</label>
                        <button
                            className={`ss-settings-toggle ${wpref.preferSunny ? 'ss-settings-toggle--on' : ''}`}
                            onClick={() => updateWeatherPref('preferSunny', !wpref.preferSunny)}
                        >
                            <Sun size={13} />
                            <span>{wpref.preferSunny ? 'Sunny Only' : 'Any Weather'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Favorite Venues ─────────────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <Heart size={14} />
                    Favorite Venues
                </h4>
                <div className="ss-settings-desc">Get alerts when conditions are perfect here</div>

                <div className="ss-fav-list">
                    {demoVenues.slice(0, 10).map(venue => {
                        const isFav = prefs.favoriteVenueIds.includes(venue.id);
                        return (
                            <button
                                key={venue.id}
                                className={`ss-fav-item ${isFav ? 'ss-fav-item--active' : ''}`}
                                onClick={() => toggleFavorite(venue.id)}
                            >
                                <span className="ss-fav-emoji">{venue.emoji}</span>
                                <span className="ss-fav-name">{venue.venueName}</span>
                                <Star size={13} className={`ss-fav-star ${isFav ? 'ss-fav-star--fill' : ''}`} />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Notification Frequency ──────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <Volume2 size={14} />
                    Frequency
                </h4>

                <div className="ss-freq-options">
                    {FREQUENCY_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={`ss-freq-option ${prefs.frequency === opt.value ? 'ss-freq-option--active' : ''}`}
                            onClick={() => setPrefs(prev => ({ ...prev, frequency: opt.value }))}
                        >
                            <div className="ss-freq-label">{opt.label}</div>
                            <div className="ss-freq-desc">{opt.desc}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Notification Categories ─────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <Filter size={14} />
                    Categories
                </h4>

                <div className="ss-cat-toggles">
                    {Object.entries(NOTIFICATION_CATEGORIES).map(([key, meta]) => {
                        const catKey = {
                            perfect: 'perfectConditions',
                            urgency: 'bookingUrgency',
                            weather: 'weatherChanges',
                            digest: 'weeklyPlanning',
                        }[key];
                        const on = prefs.enabledCategories[catKey] !== false;
                        return (
                            <button
                                key={key}
                                className={`ss-cat-toggle ${on ? 'ss-cat-toggle--on' : ''}`}
                                onClick={() => toggleCategory(catKey)}
                            >
                                <span>{meta.icon}</span>
                                <span>{meta.label}</span>
                                <span className="ss-cat-toggle-dot" />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Alert Time ──────────────────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <Clock size={14} />
                    Morning Alert Time
                </h4>
                <input
                    type="time"
                    value={prefs.alertTime}
                    onChange={e => setPrefs(prev => ({ ...prev, alertTime: e.target.value }))}
                    className="ss-settings-time"
                />
            </div>

            {/* ── Location Radius ─────────────────── */}
            <div className="ss-settings-section">
                <h4 className="ss-settings-section-title">
                    <MapPin size={14} />
                    Location Radius
                </h4>
                <div className="ss-radius-options">
                    {RADIUS_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            className={`ss-radius-option ${prefs.radiusKm === opt.value ? 'ss-radius-option--active' : ''}`}
                            onClick={() => setPrefs(prev => ({ ...prev, radiusKm: opt.value }))}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
