/**
 * @OnlyCurrentDoc
 */

// --- CONFIGURATION ---
const TARGET_SPREADSHEET_ID = '12j-32Gpij94_gfNDdBzSCT8yOlFfqCCYUlWZk4n1Qnk';
const TARGET_SHEET_NAME = 'links';
const SOURCE_FILE_NAME = 'Suivi';
const URLS_FILE_NAME = 'urls.txt';
// ---------------------

/**
 * MAIN FUNCTION
 * Run this function to perform the full synchronization cycle.
 */
function runFullSync() {
    Logger.log('=== STARTING FULL SYNC ===');

    // Step 1: Ingest new successes from urls.txt to Suivi Sheet
    processSuccessLog_();

    // Step 2: Propagate statuses from Suivi Sheet to Main Sheet
    syncStatusFromSuivi_();

    Logger.log('=== FULL SYNC COMPLETED ===');
}

/**
 * Step 1: Reads urls.txt, moves 'SUCCESS-' lines to Suivi Sheet, and cleans urls.txt
 */
function processSuccessLog_() {
    Logger.log('--- Step 1: Processing urls.txt ---');

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
        } else {
            remainingLines.push(line);
        }
    }

    if (successUrls.length === 0) {
        Logger.log('No new SUCCESS entries found in urls.txt.');
    } else {
        Logger.log(`Found ${successUrls.length} new successes.`);

        // 4. Append to "Suivi" Sheet
        const suiviFiles = DriveApp.getFilesByName(SOURCE_FILE_NAME);
        let suiviSpreadsheet = null;

        while (suiviFiles.hasNext()) {
            const file = suiviFiles.next();
            if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
                suiviSpreadsheet = SpreadsheetApp.open(file);
                break;
            }
        }

        if (!suiviSpreadsheet) {
            Logger.log(`Error: Google Sheet "${SOURCE_FILE_NAME}" not found.`);
            return;
        }

        const sheet = suiviSpreadsheet.getSheets()[0];
        const newRows = successUrls.map(url => ['SUCCESS', url, new Date()]);

        const startRow = sheet.getLastRow() + 1;
        sheet.getRange(startRow, 1, newRows.length, 3).setValues(newRows);
        Logger.log(`Appended ${newRows.length} rows to ${SOURCE_FILE_NAME}.`);

        // 5. Update urls.txt
        if (hasChanges) {
            const newContent = remainingLines.join('\n');
            urlsFile.setContent(newContent);
            Logger.log(`Cleaned up ${URLS_FILE_NAME}.`);
        }
    }
}

/**
 * Step 2: Reads Suivi Sheet and updates 'CV urls indeed'
 */
function syncStatusFromSuivi_() {
    Logger.log('--- Step 2: Syncing to Main Sheet ---');

    // 1. Find the Source Spreadsheet (Suivi)
    const files = DriveApp.getFilesByName(SOURCE_FILE_NAME);
    let sourceSpreadsheet = null;

    while (files.hasNext()) {
        const file = files.next();
        if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
            sourceSpreadsheet = SpreadsheetApp.open(file);
            break;
        }
    }

    if (!sourceSpreadsheet) {
        Logger.log(`Error: Could not find a Google Sheet named "${SOURCE_FILE_NAME}".`);
        return;
    }

    const sourceSheet = sourceSpreadsheet.getSheets()[0];
    const sourceData = sourceSheet.getDataRange().getValues();

    // 2. Build Map
    const statusMap = new Map();
    // Skip header (i=1)
    for (let i = 1; i < sourceData.length; i++) {
        const row = sourceData[i];
        const status = row[0];
        const url = row[1];

        if (url && status === 'SUCCESS') {
            statusMap.set(url.trim(), 'SUCCESS');
        }
    }

    Logger.log(`Loaded ${statusMap.size} SUCCESS statuses from ${SOURCE_FILE_NAME}.`);

    // 3. Open Target Spreadsheet
    const targetSs = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
    const targetSheet = targetSs.getSheetByName(TARGET_SHEET_NAME);

    if (!targetSheet) {
        Logger.log(`Error: Sheet "${TARGET_SHEET_NAME}" not found.`);
        return;
    }

    const lastRow = targetSheet.getLastRow();
    if (lastRow < 2) {
        Logger.log('Target sheet is empty.');
        return;
    }

    const range = targetSheet.getRange(2, 5, lastRow - 1, 2);
    const values = range.getValues(); // Col E (Status), Col F (URL)

    let updatesCount = 0;

    // 4. Update Statuses
    for (let i = 0; i < values.length; i++) {
        const currentStatus = values[i][0];
        const url = values[i][1];

        if (url) {
            const cleanUrl = url.trim();
            if (statusMap.has(cleanUrl)) {
                if (currentStatus !== 'SUCCESS') {
                    values[i][0] = 'SUCCESS';
                    updatesCount++;
                }
            }
        }
    }

    // 5. Write changes
    if (updatesCount > 0) {
        range.setValues(values);
        Logger.log(`Updated ${updatesCount} rows with SUCCESS status.`);
    } else {
        Logger.log('No new updates needed for Main Sheet.');
    }
}
