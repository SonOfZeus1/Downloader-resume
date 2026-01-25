import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const CSV_FILE = '/Users/cbz/Desktop/Indeed CV download/Urls/suivi.csv';
const XLSX_FILE = '/Users/cbz/Desktop/Indeed CV download/Urls/suivi.xlsx';

try {
    if (fs.existsSync(CSV_FILE)) {
        console.log('Reading CSV file...');
        const content = fs.readFileSync(CSV_FILE, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim() !== '');

        // Parse CSV manually to be safe or use XLSX utils if structure is simple
        // Structure: Status,URL,Date
        const data = lines.map(line => {
            const parts = line.split(',');
            // Handle potential commas in URL if any (though unlikely with our format)
            // Simple split is risky if URL has commas, but standard URLs don't usually have them in a way that breaks this simple CSV
            return {
                Status: parts[0],
                URL: parts[1],
                Date: parts.slice(2).join(',') // Rejoin rest in case of extra commas
            };
        });

        // Remove header row if it exists in data array (it was in the file)
        if (data.length > 0 && data[0].Status === 'Status') {
            data.shift(); // Remove header object
        }

        console.log(`Found ${data.length} records.`);

        // Create Workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Suivi");

        // Write File
        XLSX.writeFile(wb, XLSX_FILE);
        console.log(`Successfully created ${XLSX_FILE}`);

        // Optional: Rename old CSV to backup
        fs.renameSync(CSV_FILE, CSV_FILE + '.bak');
        console.log('Renamed old CSV to .bak');

    } else {
        console.log('No CSV file found to migrate.');
    }
} catch (e) {
    console.error('Migration failed:', e);
}
