/**
 * @OnlyCurrentDoc
 */

// Name of the source file on Drive
const URLS_FILE_NAME = 'urls.txt';

// Name of the target Google Sheet
const SUIVI_SHEET_NAME = 'Suivi';

function processSuccessLog() {
    // 1. Find urls.txt
    const files = DriveApp.getFilesByName(URLS_FILE_NAME);
    let urlsFile = null;

    while (files.hasNext()) {
        const file = files.next();
        if (file.getMimeType() === MimeType.PLAIN_TEXT) {
            urlsFile = file;
            break;
        }
    }

    if (!urlsFile) {
        Logger.log(`Error: "${URLS_FILE_NAME}" not found.`);
        return;
    }

    // 2. Read Content
    const content = urlsFile.getBlob().getDataAsString();
    const lines = content.split('\n');

    const successUrls = [];
    const remainingLines = [];
    let hasChanges = false;

    // 3. Parse Lines
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('SUCCESS-')) {
            // Extract URL: remove "SUCCESS-" prefix
            const url = trimmed.substring(8).trim();
            if (url) {
                successUrls.push(url);
                hasChanges = true;
            }
            // We DO NOT add this line to remainingLines, effectively deleting it
        } else {
            // Keep other lines (pending URLs, ERRORs, empty lines)
            remainingLines.push(line);
        }
    }

    if (successUrls.length === 0) {
        Logger.log('No new SUCCESS entries found in urls.txt.');
        return;
    }

    Logger.log(`Found ${successUrls.length} new successes.`);

    // 4. Append to "Suivi" Sheet
    const suiviFiles = DriveApp.getFilesByName(SUIVI_SHEET_NAME);
    let suiviSpreadsheet = null;

    while (suiviFiles.hasNext()) {
        const file = suiviFiles.next();
        if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
            suiviSpreadsheet = SpreadsheetApp.open(file);
            break;
        }
    }

    if (!suiviSpreadsheet) {
        Logger.log(`Error: Google Sheet "${SUIVI_SHEET_NAME}" not found.`);
        return;
    }

    const sheet = suiviSpreadsheet.getSheets()[0];
    const newRows = successUrls.map(url => ['SUCCESS', url, new Date()]);

    // Append all at once
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
    Logger.log(`Appended ${newRows.length} rows to ${SUIVI_SHEET_NAME}.`);

    // 5. Update urls.txt (Remove processed SUCCESS lines)
    if (hasChanges) {
        const newContent = remainingLines.join('\n');
        urlsFile.setContent(newContent);
        Logger.log(`Cleaned up ${URLS_FILE_NAME}.`);
    }

    // 6. Optional: Trigger the main sync script to update "CV urls indeed" immediately
    // If the function is in the same project, we can call it. 
    // Assuming the user copies all functions into the same project.
    try {
        if (typeof syncStatusFromSuivi === 'function') {
            Logger.log('Triggering syncStatusFromSuivi()...');
            syncStatusFromSuivi();
        } else {
            Logger.log('syncStatusFromSuivi function not found in this scope. Run it manually if needed.');
        }
    } catch (e) {
        Logger.log('Error triggering syncStatusFromSuivi: ' + e.message);
    }
}
