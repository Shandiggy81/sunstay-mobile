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
        lng: 144.9947,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"16:00","end":"20:00","deal":"$9 pints, $7 basics, $8 wines"}
    },
    {
        id: 2,
        name: "CQ City Bar",
        address: "113 Queen St, Melbourne",
        vibe: "Rooftop Courtyard",
        emoji: "🔥",
        tags: ["Cozy", "After Work", "Rooftop", "Wheelchair Accessible"],
        lat: -37.8136,
        lng: 144.9631,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"15:00","end":"18:00","deal":"$8 wines, $9 pints, $15 cocktails"}
    },
    {
        id: 3,
        name: "The Vineyard",
        address: "71A Acland St, St Kilda",
        vibe: "Outdoor Streetside",
        emoji: "🍷",
        tags: ["People Watching", "Sunny", "Pet Friendly", "Smoking Area"],
        lat: -37.8679,
        lng: 144.9797,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"15:00","end":"17:00","deal":"Cocktails, wines, beers specials"}
    },
    {
        id: 4,
        name: "The Emerson",
        address: "141 Commercial Rd, South Yarra",
        vibe: "Rooftop Club",
        emoji: "🍸",
        tags: ["Party", "Views", "Rooftop", "Smoking Area"],
        lat: -37.8394,
        lng: 145.0008,
        happyHour: {"days":["Fri"],"start":"17:00","end":"23:00","deal":"$5 tacos, cheap tap beers and house wines"}
    },
    {
        id: 5,
        name: "Holy Grail",
        address: "67 Chapel St, Windsor",
        vibe: "Bar",
        emoji: "⚓",
        tags: ["Fireplace", "Cozy", "Wheelchair Accessible"],
        lat: -37.8563,
        lng: 144.9951,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"15:00","end":"21:00","deal":"$6 wines, $8 basics, $12 pints"}
    },
    {
        id: 6,
        name: "Pause Bar",
        address: "268 Carlisle St, Balaclava",
        vibe: "Courtyard",
        emoji: "🥂",
        tags: ["Hidden Gem", "Sunny", "Pet Friendly"],
        lat: -37.8686,
        lng: 145.0039,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"20:00","deal":"$9 wines/prosecco, $10.5 pints, 2-for-$24+ cocktails"}
    },
    {
        id: 7,
        name: "The Railway Hotel",
        address: "29 Chapel St, Windsor",
        vibe: "Pub",
        emoji: "🍺",
        tags: ["24h License", "Deck", "Beer Garden", "Smoking Area", "Wheelchair Accessible"],
        lat: -37.8553,
        lng: 144.9945,
        happyHour: {"days":["Wed","Thu","Fri","Sat","Sun"],"start":"16:00","end":"19:00","deal":"$7 local pints, spirits & wines"}
    },
    {
        id: 8,
        name: "West Beach Pavilion",
        address: "330A Beaconsfield Pde, St Kilda",
        vibe: "Beachfront",
        emoji: "🏖️",
        tags: ["Sunset", "Sand", "Pet Friendly", "Pram Friendly", "Wheelchair Accessible"],
        lat: -37.8629,
        lng: 144.9736,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"18:00","deal":"$8.50 wines, $12 premium pints"}
    },
    {
        id: 9,
        name: "La La Land",
        address: "125 Chapel St, Windsor",
        vibe: "Lounge",
        emoji: "🛋️",
        tags: ["Comfy", "Fireplace", "Wheelchair Accessible"],
        lat: -37.8575,
        lng: 144.9960,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"17:00","end":"21:00","deal":"$5 drinks at 5pm, increases $1 each hour"}
    },
    {
        id: 10,
        name: "The Espy",
        address: "11 The Esplanade, St Kilda",
        vibe: "Iconic Pub",
        emoji: "🎸",
        tags: ["Live Music", "Views", "Rooftop", "Beer Garden", "Wheelchair Accessible"],
        lat: -37.8673,
        lng: 144.9753
    },
    {
        id: 11,
        name: "Arbory Afloat",
        address: "2 Flinders Walk, Melbourne",
        vibe: "Floating Bar",
        emoji: "🌊",
        tags: ["River", "Premium", "Wheelchair Accessible", "Smoking Area"],
        lat: -37.8183,
        lng: 144.9671
    },
    {
        id: 12,
        name: "CBCo Brewing",
        address: "89 Bertie St, Port Melbourne",
        vibe: "Brewery",
        emoji: "🍻",
        tags: ["Pet Friendly", "Large Groups", "Beer Garden", "Pram Friendly", "Wheelchair Accessible"],
        lat: -37.8363,
        lng: 144.9353
    },
    {
        id: 13,
        name: "The Dick Whittington",
        address: "32 Chapel St, St Kilda",
        vibe: "Tavern",
        emoji: "🎱",
        tags: ["Fireplace", "Pub Grub", "Pet Friendly", "Smoking Area"],
        lat: -37.8597,
        lng: 144.9953
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
        lng: 144.9669
    },
    {
        id: 15,
        name: "Good Heavens",
        address: "79 Bourke St",
        vibe: "Palm Springs Style",
        emoji: "🍹",
        tags: ["Cocktails", "Sunny", "Rooftop", "Smoking Area"],
        lat: -37.8136,
        lng: 144.9685,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"15:00","end":"18:00","deal":"$8 wines and $10 spirits"}
    },
    {
        id: 16,
        name: "Siglo",
        address: "161 Spring St",
        vibe: "Terrace",
        emoji: "🏛️",
        tags: ["Premium", "Cigars", "Rooftop", "Smoking Area"],
        lat: -37.8136,
        lng: 144.9734
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
        lng: 144.9717,
        happyHour: {"days":["Fri"],"start":"17:00","end":"00:00","deal":"$10 cocktails all night long"}
    },
    {
        id: 18,
        name: "Welcome to Thornbury",
        address: "520 High St",
        vibe: "Truck Park",
        emoji: "🚚",
        tags: ["Pram Friendly", "Beer Garden", "Pet Friendly", "Wheelchair Accessible"],
        lat: -37.7608,
        lng: 145.0125,
        happyHour: {"days":["Fri"],"start":"16:00","end":"18:00","deal":"$20 Mr Burger and Chips"}
    },
    {
        id: 19,
        name: "The Standard",
        address: "293 Fitzroy St, Fitzroy",
        vibe: "Maze Garden",
        emoji: "🌿",
        tags: ["Hidden", "Vines", "Beer Garden", "Pet Friendly"],
        lat: -37.7997,
        lng: 144.9789
    },
    {
        id: 20,
        name: "Howler",
        address: "7-11 Dawson St, Brunswick",
        vibe: "Warehouse",
        emoji: "🌳",
        tags: ["Garden", "Arts", "Beer Garden", "Pet Friendly", "Pram Friendly"],
        lat: -37.7686,
        lng: 144.9597,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"17:00","end":"19:00","deal":"$10 Coopers Draught and Pale Ale pints"}
    },
    {
        id: 21,
        name: "Dr Morse",
        address: "274 Johnston St",
        vibe: "Courtyard",
        emoji: "☕",
        tags: ["Day/Night", "Sunny", "Pet Friendly", "Wheelchair Accessible"],
        lat: -37.7997,
        lng: 144.9944,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],"start":"15:00","end":"18:00","deal":"$10 house beers, wines, basic spirits, $15 espresso martinis"}
    },
    {
        id: 22,
        name: "Riverland Bar",
        address: "Federation Wharf",
        vibe: "Waterfront",
        emoji: "🌉",
        tags: ["River", "Sunny", "Wheelchair Accessible", "Smoking Area"],
        lat: -37.8183,
        lng: 144.9625,
        happyHour: {"days":["Mon","Tue","Wed","Thu","Fri"],"start":"16:00","end":"19:00","deal":"$10 pints, wines, spirits, and spritzes"}
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
