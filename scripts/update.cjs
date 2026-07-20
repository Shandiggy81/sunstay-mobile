const fs = require('fs');

const deals = {
  "Wonderland": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '16:00', end: '20:00', deal: '$9 Pints, $7 Basics & $12 Cocktails' },
  "CQ City Bar": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '15:00', end: '18:00', deal: '$8 Wines, $9 Pints & $15 Cocktails' },
  "The Vineyard": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '15:00', end: '17:00', deal: 'Daily Discounted Drinks' },
  "The Emerson": { days: ['Fri'], start: '17:00', end: '20:00', deal: '$7 Tap Beers/Wines & $3.50 Oysters' },
  "Holy Grail": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '15:00', end: '19:00', deal: '$6 Wines/Pots & $12 Pints' },
  "Pause Bar": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], start: '16:00', end: '19:00', deal: '$10.50 Pints & 2-for-$26 Espresso Martinis' },
  "The Railway Hotel": { days: ['Wed', 'Thu', 'Fri', 'Sat'], start: '16:00', end: '19:00', deal: '$7 Spirits/Wines & $10 Pints' },
  "West Beach Pavilion": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '16:00', end: '18:00', deal: 'Happy Hour by the Bay Drinks' },
  "La La Land": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '17:00', end: '21:00', deal: 'Sliding Prices: $5 at 5pm, $6 at 6pm, $7 at 7pm' },
  "CBCo Brewing": { days: ['Sat'], start: '14:00', end: '17:00', deal: '$6 Schooners (Tappy Hour)' },
  "Rooftop Bar": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '16:00', end: '18:00', deal: 'Discounted House Drinks' },
  "Good Heavens": { days: ['Tue', 'Wed', 'Thu', 'Fri'], start: '15:00', end: '18:00', deal: '$8 Wines & $10 Spirits' },
  "Welcome to Thornbury": { days: ['Wed', 'Thu', 'Fri'], start: '17:00', end: '19:00', deal: '$9 Schooners, $8 Spirits, $7 Wines' },
  "The Standard": { days: ['Mon', 'Tue', 'Wed', 'Thu'], start: '15:00', end: '18:00', deal: '$4 Pots & $8 Pints' },
  "Howler": { days: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], start: '17:00', end: '19:00', deal: '$10 Pints' },
  "Dr Morse": { days: ['Tue', 'Wed', 'Thu', 'Fri'], start: '16:00', end: '18:00', deal: '$8 Pints & $12 Espresso Martinis' },
  "Riverland Bar": { days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], start: '16:00', end: '19:00', deal: '$10 Pints, Wines, Spirits & Spritz' },
  "The Espy": null,
  "Arbory Afloat": null,
  "The Dick Whittington": null,
  "Siglo": null,
  "The Great Northern": null
};

let content = fs.readFileSync('src/data/venues.js', 'utf8');

for (const [name, deal] of Object.entries(deals)) {
    const regex = new RegExp(`(name:\\s*"${name}",[\\w\\W]*?)(?:,\\s*happyHour:\\s*{.*?})?(\\n\\s*})`, "g");
    content = content.replace(regex, (match, p1, p2) => {
        if (deal === null) {
            return `${p1}${p2}`;
        } else {
            return `${p1},\n        happyHour: ${JSON.stringify(deal)}${p2}`;
        }
    });
}
fs.writeFileSync('src/data/venues.js', content);
console.log('venues.js updated successfully!');
