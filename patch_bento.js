const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'components', 'VenueCard.jsx');
console.log('Targeting:', filePath);

try {
    let content = fs.readFileSync(filePath, 'utf8');
    console.log('Read file successfully, size:', content.length);

    // Target 1: Hero Comfort Score
    const heroStartMarker = 'glass-dark col-span-2 rounded-[2rem] p-5 flex flex-col justify-between min-h-[140px] shadow-xl relative overflow-hidden group hover:scale-[1.01] transition-transform duration-300 cursor-default"';

    if (content.includes(heroStartMarker)) {
        console.log('Found Hero cell start');
        content = content.replace(
            `<div className="${heroStartMarker}>`,
            `<motion.div \n                                                            whileTap={{ scale: 0.985 }}\n                                                            className="${heroStartMarker}>\n                                                            {/* Shimmer Effect */}\n                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none" style={{ backgroundSize: '200% 100%' }} />\n                                                            `
        );
        content = content.replace(
            '                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />\n                                                        </div>',
            '                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />\n                                                        </motion.div>'
        );
    } else {
        console.warn('Could NOT find Hero cell marker');
    }

    // Target 2: Wind/UV Cells (Shared Class)
    const bentoClass = 'glass rounded-[2rem] p-5 flex flex-col justify-between min-h-[120px] shadow-sm transition-all hover:shadow-md hover:bg-white/80 group"';

    if (content.includes(bentoClass)) {
        console.log('Found standard Bento cell start');
        // Replace all occurrences of this specific div start with a motion.div + whileTap
        const searchStr = `<div className="${bentoClass}>`;
        const replaceStr = `<motion.div \n                                                            whileTap={{ scale: 0.985 }}\n                                                            className="${bentoClass}>`;

        let count = 0;
        while (content.includes(searchStr)) {
            content = content.replace(searchStr, replaceStr);
            count++;
        }
        console.log(`Updated ${count} standard Bento cells with haptics`);

        // Update closing tags for these specific cells (manually finding the next </div> matches)
        // This is complex, so we'll just look for standard ending of those 120px cells.
    }

    // Simple closing tag replacement for the 120px cells
    content = content.replace(/<\/div>(\s+)\{?\/?(\*?)\s*ROW 2: UV Index/g, '</motion.div>$1{/* ROW 2: UV Index');
    content = content.replace(/<\/div>(\s+)\{?\/?(\*?)\s*ROW 3: Rain Forecast/g, '</motion.div>$1{/* ROW 3: Rain Forecast');

    // Target 3: Rain Forecast Cell
    const rainClass = 'glass col-span-2 rounded-[2rem] p-5 flex flex-col justify-between min-h-[110px] shadow-sm transition-all hover:shadow-md hover:bg-white/80"';
    if (content.includes(rainClass)) {
        console.log('Found Rain Forecast cell');
        content = content.replace(
            `<div className="${rainClass}>`,
            `<motion.div \n                                                            whileTap={{ scale: 0.985 }}\n                                                            className="${rainClass}>`
        );
        // Correct ending for Rain Forecast (end of bento grid)
        content = content.replace(
            /<\/div>\s+<\/div>\s+<div className="mt-6 flex flex-wrap gap-2"/,
            '</motion.div>\n                                                    </div>\n                                                    <div className="mt-6 flex flex-wrap gap-2"'
        );
    }

    fs.writeFileSync(filePath, content);
    console.log('Successfully patched VenueCard.jsx');

} catch (err) {
    console.error('Error during patching:', err);
    process.exit(1);
}
