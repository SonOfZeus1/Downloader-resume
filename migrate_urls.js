import fs from 'fs';
import path from 'path';

const URLS_FILE = '/Users/cbz/Desktop/Indeed CV download/Urls/urls.txt';
const CSV_FILE = '/Users/cbz/Desktop/Indeed CV download/Urls/suivi.csv';

try {
    if (!fs.existsSync(URLS_FILE)) {
        console.error('URLS_FILE not found:', URLS_FILE);
        process.exit(1);
    }

    const content = fs.readFileSync(URLS_FILE, 'utf-8');
    const lines = content.split('\n');

    let successLines = [];
    let remainingLines = [];

    // Check if CSV exists to add header
    let csvContent = '';
    if (!fs.existsSync(CSV_FILE)) {
        csvContent = 'Status,URL,Date\n';
    }

    const now = new Date().toISOString();

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('SUCCESS-')) {
            const url = trimmed.substring(8); // Remove 'SUCCESS-'
            successLines.push(`SUCCESS,${url},${now}`);
        } else {
            remainingLines.push(line); // Keep original formatting for others
        }
    }

    if (successLines.length > 0) {
        fs.appendFileSync(CSV_FILE, csvContent + successLines.join('\n') + '\n');
        fs.writeFileSync(URLS_FILE, remainingLines.join('\n'));
        console.log(`Migrated ${successLines.length} lines to ${CSV_FILE}`);
        console.log(`Updated ${URLS_FILE} with ${remainingLines.length} remaining lines.`);
    } else {
        console.log('No SUCCESS lines found to migrate.');
    }

} catch (e) {
    console.error('Migration failed:', e);
}
