// Melbourne Venues Data with Geocoded Coordinates and Accessibility Tags
export const venues = [
    // The Icons
    {
        id: 1,
        name: "Wonderland",
        address: "37 Chapel St, Windsor",
        vibe: "Beer Garden",
        emoji: "🌿",
        tags: ["Sunny", "Garden", "Beer Garden", "Pet Friendly", "Pram Friendly"],
        lat: -37.8556,
        lng: 144.9947,
        happyHour: { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '16:00', end: '20:00', deal: '$9 Pints, $7 Basics & $12 Cocktails' },
        weatherNow: { windSpeed: 12, uvIndex: 6, precipProb: 18 },
        shielding: { windbreak: 82, rainCover: 65, shadeFactor: 70 }
    },
    {
        id: 2,
        name: "CQ City Bar",
        address: "113 Queen St, Melbourne",
        vibe: "Rooftop Courtyard",
        emoji: "🔥",
        tags: ["Cozy", "After Work", "Rooftop", "Wheelchair Accessible"],
        lat: -37.8136,
        lng: 144.9631,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"15:00","end":"18:00","deal":"$8 Wines, $9 Pints & $15 Cocktails"},
        weatherNow: { windSpeed: 28, uvIndex: 7, precipProb: 12 },
        shielding: { windbreak: 45, rainCover: 55, shadeFactor: 45 }
    },
    {
        id: 3,
        name: "The Vineyard",
        address: "71A Acland St, St Kilda",
        vibe: "Outdoor Streetside",
        emoji: "🍷",
        tags: ["People Watching", "Sunny", "Pet Friendly", "Smoking Area"],
        lat: -37.8679,
        lng: 144.9797,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"15:00","end":"17:00","deal":"Daily Discounted Drinks"},
        weatherNow: { windSpeed: 18, uvIndex: 6, precipProb: 22 },
        shielding: { windbreak: 60, rainCover: 75, shadeFactor: 55 }
    },
    {
        id: 4,
        name: "The Emerson",
        address: "141 Commercial Rd, South Yarra",
        vibe: "Rooftop Club",
        emoji: "🍸",
        tags: ["Party", "Views", "Rooftop", "Smoking Area"],
        lat: -37.8394,
        lng: 145.0008,
        happyHour: {"days":["Fri"],"start":"17:00","end":"20:00","deal":"$7 Tap Beers/Wines & $3.50 Oysters"},
        weatherNow: { windSpeed: 32, uvIndex: 8, precipProb: 15 },
        shielding: { windbreak: 35, rainCover: 60, shadeFactor: 50 }
    },
    {
        id: 5,
        name: "Holy Grail",
        address: "67 Chapel St, Windsor",
        vibe: "Bar",
        emoji: "⚓",
        tags: ["Fireplace", "Cozy", "Wheelchair Accessible"],
        lat: -37.8563,
        lng: 144.9951,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"15:00","end":"19:00","deal":"$6 Wines/Pots & $12 Pints"},
        weatherNow: { windSpeed: 8, uvIndex: 4, precipProb: 12 },
        shielding: { windbreak: 92, rainCover: 95, shadeFactor: 85 }
    },
    {
        id: 6,
        name: "Pause Bar",
        address: "268 Carlisle St, Balaclava",
        vibe: "Courtyard",
        emoji: "🥂",
        tags: ["Hidden Gem", "Sunny", "Pet Friendly"],
        lat: -37.8686,
        lng: 145.0039,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat"],"start":"16:00","end":"19:00","deal":"$10.50 Pints & 2-for-$26 Espresso Martinis"},
        weatherNow: { windSpeed: 10, uvIndex: 5, precipProb: 15 },
        shielding: { windbreak: 88, rainCover: 90, shadeFactor: 75 }
    },
    {
        id: 7,
        name: "The Railway Hotel",
        address: "29 Chapel St, Windsor",
        vibe: "Pub",
        emoji: "🍺",
        tags: ["24h License", "Deck", "Beer Garden", "Smoking Area", "Wheelchair Accessible"],
        lat: -37.8553,
        lng: 144.9945,
        happyHour: {"days":["Wed","Thu","Fri","Sat"],"start":"16:00","end":"19:00","deal":"$7 Spirits/Wines & $10 Pints"},
        weatherNow: { windSpeed: 15, uvIndex: 5, precipProb: 25 },
        shielding: { windbreak: 75, rainCover: 80, shadeFactor: 65 }
    },
    {
        id: 8,
        name: "West Beach Pavilion",
        address: "330A Beaconsfield Pde, St Kilda",
        vibe: "Beachfront",
        emoji: "🏖️",
        tags: ["Sunset", "Sand", "Pet Friendly", "Pram Friendly", "Wheelchair Accessible"],
        lat: -37.8629,
        lng: 144.9736,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"18:00","deal":"Happy Hour by the Bay Drinks"},
        weatherNow: { windSpeed: 30, uvIndex: 8, precipProb: 20 },
        shielding: { windbreak: 45, rainCover: 35, shadeFactor: 55 }
    },
    {
        id: 9,
        name: "La La Land",
        address: "125 Chapel St, Windsor",
        vibe: "Lounge",
        emoji: "🛋️",
        tags: ["Comfy", "Fireplace", "Wheelchair Accessible"],
        lat: -37.8575,
        lng: 144.9960,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"17:00","end":"21:00","deal":"Sliding Prices: $5 at 5pm, $6 at 6pm, $7 at 7pm"},
        weatherNow: { windSpeed: 6, uvIndex: 3, precipProb: 10 },
        shielding: { windbreak: 95, rainCover: 100, shadeFactor: 90 }
    },
    {
        id: 10,
        name: "The Espy",
        address: "11 The Esplanade, St Kilda",
        vibe: "Iconic Pub",
        emoji: "🎸",
        tags: ["Live Music", "Views", "Rooftop", "Beer Garden", "Wheelchair Accessible"],
        lat: -37.8673,
        lng: 144.9753,
        weatherNow: { windSpeed: 22, uvIndex: 7, precipProb: 28 },
        shielding: { windbreak: 65, rainCover: 75, shadeFactor: 55 }
    },
    {
        id: 11,
        name: "Arbory Afloat",
        address: "2 Flinders Walk, Melbourne",
        vibe: "Floating Bar",
        emoji: "🌊",
        tags: ["River", "Premium", "Wheelchair Accessible", "Smoking Area"],
        lat: -37.8183,
        lng: 144.9671,
        weatherNow: { windSpeed: 28, uvIndex: 8, precipProb: 18 },
        shielding: { windbreak: 50, rainCover: 40, shadeFactor: 60 }
    },
    {
        id: 12,
        name: "CBCo Brewing",
        address: "89 Bertie St, Port Melbourne",
        vibe: "Brewery",
        emoji: "🍻",
        tags: ["Pet Friendly", "Large Groups", "Beer Garden", "Pram Friendly", "Wheelchair Accessible"],
        lat: -37.8363,
        lng: 144.9353,
        happyHour: {"days":["Sat"],"start":"14:00","end":"17:00","deal":"$6 Schooners (Tappy Hour)"},
        weatherNow: { windSpeed: 12, uvIndex: 5, precipProb: 24 },
        shielding: { windbreak: 80, rainCover: 85, shadeFactor: 70 }
    },
    {
        id: 13,
        name: "The Dick Whittington",
        address: "32 Chapel St, St Kilda",
        vibe: "Tavern",
        emoji: "🎱",
        tags: ["Fireplace", "Pub Grub", "Pet Friendly", "Smoking Area"],
        lat: -37.8597,
        lng: 144.9953,
        weatherNow: { windSpeed: 18, uvIndex: 6, precipProb: 32 },
        shielding: { windbreak: 65, rainCover: 80, shadeFactor: 55 }
    },
    // CBD Rooftops
    {
        id: 14,
        name: "Rooftop Bar",
        address: "252 Swanston St",
        vibe: "Cinema Rooftop",
        emoji: "🍿",
        tags: ["Views", "Casual", "Rooftop", "Wheelchair Accessible"],
        lat: -37.8136,
        lng: 144.9669,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"18:00","deal":"Discounted House Drinks"},
        weatherNow: { windSpeed: 35, uvIndex: 8, precipProb: 12 },
        shielding: { windbreak: 40, rainCover: 55, shadeFactor: 45 }
    },
    {
        id: 15,
        name: "Good Heavens",
        address: "79 Bourke St",
        vibe: "Palm Springs Style",
        emoji: "🍹",
        tags: ["Cocktails", "Sunny", "Rooftop", "Smoking Area"],
        lat: -37.8136,
        lng: 144.9685,
        happyHour: {"days":["Tue","Wed","Thu","Fri"],"start":"15:00","end":"18:00","deal":"$8 Wines & $10 Spirits"},
        weatherNow: { windSpeed: 26, uvIndex: 7, precipProb: 14 },
        shielding: { windbreak: 50, rainCover: 65, shadeFactor: 55 }
    },
    {
        id: 16,
        name: "Siglo",
        address: "161 Spring St",
        vibe: "Terrace",
        emoji: "🏛️",
        tags: ["Premium", "Cigars", "Rooftop", "Smoking Area"],
        lat: -37.8136,
        lng: 144.9734,
        weatherNow: { windSpeed: 30, uvIndex: 8, precipProb: 18 },
        shielding: { windbreak: 42, rainCover: 50, shadeFactor: 58 }
    },
    // Northside & Friendly
    {
        id: 17,
        name: "The Great Northern",
        address: "644 Rathdowne St",
        vibe: "Pub",
        emoji: "🐾",
        tags: ["Dog Friendly", "Sport", "Pet Friendly", "Beer Garden"],
        lat: -37.7833,
        lng: 144.9717,
        weatherNow: { windSpeed: 14, uvIndex: 5, precipProb: 28 },
        shielding: { windbreak: 72, rainCover: 82, shadeFactor: 60 }
    },
    {
        id: 18,
        name: "Welcome to Thornbury",
        address: "520 High St",
        vibe: "Truck Park",
        emoji: "🚚",
        tags: ["Pram Friendly", "Beer Garden", "Pet Friendly", "Wheelchair Accessible"],
        lat: -37.7608,
        lng: 145.0125,
        happyHour: {"days":["Wed","Thu","Fri"],"start":"17:00","end":"19:00","deal":"$9 Schooners, $8 Spirits, $7 Wines"},
        weatherNow: { windSpeed: 10, uvIndex: 6, precipProb: 22 },
        shielding: { windbreak: 85, rainCover: 75, shadeFactor: 65 }
    },
    {
        id: 19,
        name: "The Standard",
        address: "293 Fitzroy St, Fitzroy",
        vibe: "Maze Garden",
        emoji: "🌿",
        tags: ["Hidden", "Vines", "Beer Garden", "Pet Friendly"],
        lat: -37.7997,
        lng: 144.9789,
        happyHour: {"days":["Mon","Tue","Wed","Thu"],"start":"15:00","end":"18:00","deal":"$4 Pots & $8 Pints"},
        weatherNow: { windSpeed: 14, uvIndex: 6, precipProb: 26 },
        shielding: { windbreak: 80, rainCover: 72, shadeFactor: 70 }
    },
    {
        id: 20,
        name: "Howler",
        address: "7-11 Dawson St, Brunswick",
        vibe: "Warehouse",
        emoji: "🌳",
        tags: ["Garden", "Arts", "Beer Garden", "Pet Friendly", "Pram Friendly"],
        lat: -37.7686,
        lng: 144.9597,
        happyHour: {"days":["Tue","Wed","Thu","Fri","Sat","Sun"],"start":"17:00","end":"19:00","deal":"$10 Pints"},
        weatherNow: { windSpeed: 9, uvIndex: 5, precipProb: 22 },
        shielding: { windbreak: 82, rainCover: 88, shadeFactor: 72 }
    },
    {
        id: 21,
        name: "Dr Morse",
        address: "274 Johnston St",
        vibe: "Courtyard",
        emoji: "☕",
        tags: ["Day/Night", "Sunny", "Pet Friendly", "Wheelchair Accessible"],
        lat: -37.7997,
        lng: 144.9944,
        happyHour: {"days":["Tue","Wed","Thu","Fri"],"start":"16:00","end":"18:00","deal":"$8 Pints & $12 Espresso Martinis"},
        weatherNow: { windSpeed: 7, uvIndex: 4, precipProb: 15 },
        shielding: { windbreak: 90, rainCover: 95, shadeFactor: 80 }
    },
    {
        id: 22,
        name: "Riverland Bar",
        address: "Federation Wharf",
        vibe: "Waterfront",
        emoji: "🌉",
        tags: ["River", "Sunny", "Wheelchair Accessible", "Smoking Area"],
        lat: -37.8183,
        lng: 144.9625,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"19:00","deal":"$10 Pints, Wines, Spirits & Spritz"},
        weatherNow: { windSpeed: 25, uvIndex: 7, precipProb: 22 },
        shielding: { windbreak: 55, rainCover: 45, shadeFactor: 58 }
    }
];

// Filter categories for the app
export const FILTER_CATEGORIES = [
    { id: 'rooftop', label: 'Rooftop', icon: '🏙️', tag: 'Rooftop' },
    { id: 'beer-garden', label: 'Beer Garden', icon: '🍺', tag: 'Beer Garden' },
    { id: 'pram-friendly', label: 'Pram Friendly', icon: '👶', tag: 'Pram Friendly' },
    { id: 'pet-friendly', label: 'Pet Friendly', icon: '🐕', tag: 'Pet Friendly' },
    { id: 'wheelchair', label: 'Wheelchair Accessible', icon: '♿', tag: 'Wheelchair Accessible' },
    { id: 'smoking', label: 'Smoking Area', icon: '🚬', tag: 'Smoking Area' },
];

// Melbourne center coordinates for initial map view
export const MELBOURNE_CENTER = {
    lat: -37.8136,
    lng: 144.9631
};
