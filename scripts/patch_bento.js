const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'VenueCard.jsx');
console.log('Targeting:', filePath);

try {
    let content = fs.readFileSync(filePath, 'utf8');
    console.log('Read file successfully, size:', content.length);

    const heroStartMarker = 'glass-dark col-span-2 rounded-[2rem] p-5 flex flex-col justify-between min-h-[140px] shadow-xl relative overflow-hidden group hover:scale-[1.01] transition-transform duration-300 cursor-default"';

    if (content.includes(heroStartMarker)) {
        console.log('Found Hero cell start');
        content = content.replace(
            `<div className="${heroStartMarker}>`,
            `<motion.div \n                                                            whileTap={{ scale: 0.985 }}\n                                                            className="${heroStartMarker}>\n                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_3s_infinite] pointer-events-none" style={{ backgroundSize: '200% 100%' }} />\n                                                            `
        );
    } else {
        console.warn('Could NOT find Hero cell marker');
    }

    const bentoClass = 'glass rounded-[2rem] p-5 flex flex-col justify-between min-h-[120px] shadow-sm transition-all hover:shadow-md hover:bg-white/80 group"';

    if (content.includes(bentoClass)) {
        console.log('Found standard Bento cell start');
        const searchStr = `<div className="${bentoClass}>`;
        const replaceStr = `<motion.div \n                                                            whileTap={{ scale: 0.985 }}\n                                                            className="${bentoClass}>`;
        let count = 0;
        while (content.includes(searchStr)) {
            content = content.replace(searchStr, replaceStr);
            count++;
        }
        console.log(`Updated ${count} standard Bento cells with haptics`);
    }

    fs.writeFileSync(filePath, content);
    console.log('Successfully patched VenueCard.jsx');

} catch (err) {
    console.error('Error during patching:', err);
    process.exit(1);
}
