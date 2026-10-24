const fs = require('fs');
try {
    const data = fs.readFileSync('public/faqs.json', 'utf8');
    const json = JSON.parse(data);
    console.log('JSON is valid. Total items:', json.length);
} catch (e) {
    console.error('JSON Error:', e.message);
    if (e.message.includes('at position')) {
        const pos = parseInt(e.message.match(/at position (\d+)/)[1]);
        const data = fs.readFileSync('public/faqs.json', 'utf8');
        console.error('Error near:', data.substring(Math.max(0, pos - 50), Math.min(data.length, pos + 50)));
    }
}
