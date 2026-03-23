const fs = require('fs');
const content = fs.readFileSync('src/data/venues.js', 'utf8');

const happyHours = [
  { "id": 1, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "start": "16:00", "end": "20:00", "deal": "$9 pints, $7 basics, $8 wines" } },
  { "id": 2, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "15:00", "end": "18:00", "deal": "$8 wines, $9 pints, $15 cocktails" } },
  { "id": 3, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "start": "15:00", "end": "17:00", "deal": "Cocktails, wines, beers specials" } },
  { "id": 4, "happyHour": { "days": ["Fri"], "start": "17:00", "end": "23:00", "deal": "$5 tacos, cheap tap beers and house wines" } },
  { "id": 5, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "15:00", "end": "21:00", "deal": "$6 wines, $8 basics, $12 pints" } },
  { "id": 6, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "16:00", "end": "20:00", "deal": "$9 wines/prosecco, $10.5 pints, 2-for-$24+ cocktails" } },
  { "id": 7, "happyHour": { "days": ["Wed", "Thu", "Fri", "Sat", "Sun"], "start": "16:00", "end": "19:00", "deal": "$7 local pints, spirits & wines" } },
  { "id": 8, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "16:00", "end": "18:00", "deal": "$8.50 wines, $12 premium pints" } },
  { "id": 9, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "start": "17:00", "end": "21:00", "deal": "$5 drinks at 5pm, increases $1 each hour" } },
  { "id": 10, "happyHour": null },
  { "id": 11, "happyHour": null },
  { "id": 12, "happyHour": null },
  { "id": 13, "happyHour": null },
  { "id": 14, "happyHour": null },
  { "id": 15, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "15:00", "end": "18:00", "deal": "$8 wines and $10 spirits" } },
  { "id": 16, "happyHour": null },
  { "id": 17, "happyHour": { "days": ["Fri"], "start": "17:00", "end": "00:00", "deal": "$10 cocktails all night long" } },
  { "id": 18, "happyHour": { "days": ["Fri"], "start": "16:00", "end": "18:00", "deal": "$20 Mr Burger and Chips" } },
  { "id": 19, "happyHour": null },
  { "id": 20, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "start": "17:00", "end": "19:00", "deal": "$10 Coopers Draught and Pale Ale pints" } },
  { "id": 21, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], "start": "15:00", "end": "18:00", "deal": "$10 house beers, wines, basic spirits, $15 espresso martinis" } },
  { "id": 22, "happyHour": { "days": ["Mon", "Tue", "Wed", "Thu", "Fri"], "start": "16:00", "end": "19:00", "deal": "$10 pints, wines, spirits, and spritzes" } }
];

let newContent = content.replace(/({\s*id:\s*(\d+),[\s\S]*?)(\n\s*})/g, (match, p1, p2, p3) => {
    const id = parseInt(p2, 10);
    const hData = happyHours.find(h => h.id === id);
    if (!hData || !hData.happyHour) return match;
    return `${p1},\n        happyHour: ${JSON.stringify(hData.happyHour)}${p3}`;
});

fs.writeFileSync('src/data/venues.js', newContent);
console.log('venues.js updated successfully!');
