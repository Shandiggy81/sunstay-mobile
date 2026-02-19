/**
 * Venue Category Detection & Contextual Copy
 * ────────────────────────────────────────────
 * Detects venue category from venue data (vibe, tags, segment, name)
 * and returns category-specific UI copy for the photo upload feature.
 *
 * Categories: bar | cafe | real_estate | hotel | airbnb
 * Fallback: bar (most venues in the current dataset are hospitality)
 */

// ── Category Detection ────────────────────────────────────────────

/**
 * Detects the venue category from the venue data object.
 * Uses a weighted keyword matching approach across multiple fields.
 */
export function detectVenueCategory(venue, company) {
    if (!venue) return 'bar';

    // Combine all searchable text into a single lowercase string
    const searchText = [
        venue.vibe,
        venue.venueName,
        ...(venue.tags || []),
        venue.notes,
        company?.segment,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    // ── Hotel detection ──
    const hotelKeywords = [
        'hotel', 'boutique hotel', 'resort', 'accommodation',
        'lodge', 'suite', 'stay', 'check-in', 'concierge',
    ];
    if (hotelKeywords.some((kw) => searchText.includes(kw))) {
        // Distinguish from Airbnb by checking for specific markers
        if (searchText.includes('airbnb') || searchText.includes('bnb') || searchText.includes('self-contained')) {
            return 'airbnb';
        }
        return 'hotel';
    }

    // ── Airbnb detection ──
    const airbnbKeywords = [
        'airbnb', 'bnb', 'self-contained', 'holiday home',
        'vacation rental', 'cottage', 'cabin', 'glamping',
        'treehouse', 'tiny house',
    ];
    if (airbnbKeywords.some((kw) => searchText.includes(kw))) {
        return 'airbnb';
    }

    // ── Real Estate detection ──
    const realEstateKeywords = [
        'real estate', 'property', 'listing', 'for sale',
        'for rent', 'apartment', 'unit', 'house', 'townhouse',
        'natural light', 'open home', 'inspection',
    ];
    if (realEstateKeywords.some((kw) => searchText.includes(kw))) {
        return 'real_estate';
    }

    // ── Cafe detection ──
    const cafeKeywords = [
        'cafe', 'café', 'coffee', 'co-work', 'cowork',
        'bookshop', 'brunch', 'breakfast', 'bakery',
        'tea room', 'patisserie',
    ];
    if (cafeKeywords.some((kw) => searchText.includes(kw))) {
        return 'cafe';
    }

    // ── Bar detection (explicit) ──
    // Everything else in the hospitality space defaults to bar
    // but we still check to give a confident classification
    const barKeywords = [
        'bar', 'pub', 'tavern', 'brewery', 'beer garden',
        'rooftop', 'cocktail', 'lounge', 'club', 'garden',
        'terrace', 'deck', 'floating', 'waterfront', 'stadium',
        'music', 'event', 'food truck', 'warehouse',
    ];
    if (barKeywords.some((kw) => searchText.includes(kw))) {
        return 'bar';
    }

    // Default fallback
    return 'bar';
}


// ── Category Copy Configuration ───────────────────────────────────

const CATEGORY_CONFIG = {
    bar: {
        // Photo upload button
        buttonText: "How's the vibe right now?",
        buttonSubtext: '📸 Weather-Tagged',
        buttonIcon: '🍻',

        // Upload modal
        modalTitle: 'Share the Vibe',
        modalSubtitle: 'Show everyone what it looks like right now',
        capturePrompt: 'Snap the atmosphere',
        captureSubtext: 'Capture the vibe, crowd, or your drink',
        uploadButtonText: 'Share Vibe Photo',

        // Gallery
        galleryTitle: 'Vibe Check',
        galleryEmptyIcon: '🍸',
        galleryEmptyTitle: 'No vibes shared yet',
        galleryEmptySubtext: 'Be the first to show the atmosphere!',

        // Accent color
        accentColor: '#f59e0b', // amber
        accentGradient: 'from-amber-500 to-orange-500',
    },

    cafe: {
        buttonText: "How's the vibe right now?",
        buttonSubtext: '☕ Weather-Tagged',
        buttonIcon: '☕',

        modalTitle: 'Share the Vibe',
        modalSubtitle: 'Show the cozy corner or sunny spot',
        capturePrompt: 'Capture the mood',
        captureSubtext: 'Your coffee, the space, or the view',
        uploadButtonText: 'Share Cafe Moment',

        galleryTitle: 'Cafe Moments',
        galleryEmptyIcon: '☕',
        galleryEmptyTitle: 'No moments shared yet',
        galleryEmptySubtext: 'Share your cafe experience!',

        accentColor: '#92400e', // warm brown
        accentGradient: 'from-amber-700 to-orange-600',
    },

    real_estate: {
        buttonText: "Show this property's natural light",
        buttonSubtext: '🏠 Weather-Tagged',
        buttonIcon: '🏠',

        modalTitle: 'Property Light Check',
        modalSubtitle: 'Capture the natural light conditions',
        capturePrompt: 'Show the natural light',
        captureSubtext: 'Windows, rooms, or outdoor areas',
        uploadButtonText: 'Upload Light Photo',

        galleryTitle: 'Natural Light Gallery',
        galleryEmptyIcon: '🪟',
        galleryEmptyTitle: 'No light photos yet',
        galleryEmptySubtext: 'Show how the sun hits this property!',

        accentColor: '#2563eb', // blue
        accentGradient: 'from-blue-500 to-indigo-500',
    },

    hotel: {
        buttonText: 'Share your stay experience',
        buttonSubtext: '🏨 Weather-Tagged',
        buttonIcon: '🏨',

        modalTitle: 'Share Your Stay',
        modalSubtitle: 'Show the view, room, or relaxation spot',
        capturePrompt: 'Capture your experience',
        captureSubtext: 'The view, pool, lobby, or your room',
        uploadButtonText: 'Share Stay Photo',

        galleryTitle: 'Guest Experiences',
        galleryEmptyIcon: '🛏️',
        galleryEmptyTitle: 'No guest photos yet',
        galleryEmptySubtext: 'Be the first to share your stay!',

        accentColor: '#7c3aed', // violet
        accentGradient: 'from-violet-500 to-purple-500',
    },

    airbnb: {
        buttonText: "How's the outdoor space today?",
        buttonSubtext: '🌿 Weather-Tagged',
        buttonIcon: '🏡',

        modalTitle: 'Share the Space',
        modalSubtitle: 'Show the garden, balcony, or surrounds',
        capturePrompt: 'Capture the outdoor space',
        captureSubtext: 'Garden, patio, balcony, or surrounds',
        uploadButtonText: 'Share Space Photo',

        galleryTitle: 'Outdoor Space Gallery',
        galleryEmptyIcon: '🌿',
        galleryEmptyTitle: 'No outdoor photos yet',
        galleryEmptySubtext: "Show how the outdoor space looks today!",

        accentColor: '#059669', // emerald
        accentGradient: 'from-emerald-500 to-teal-500',
    },
};

/**
 * Returns the full category configuration for a venue.
 */
export function getVenueCategoryConfig(venue, company) {
    const category = detectVenueCategory(venue, company);
    return {
        category,
        ...CATEGORY_CONFIG[category],
    };
}

/**
 * Returns just the detected category string.
 */
export function getVenueCategoryName(category) {
    const labels = {
        bar: 'Bar / Pub',
        cafe: 'Cafe',
        real_estate: 'Real Estate',
        hotel: 'Hotel',
        airbnb: 'Airbnb',
    };
    return labels[category] || 'Venue';
}
