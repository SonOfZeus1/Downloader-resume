/**
 * @OnlyCurrentDoc
 */

// ID of the source spreadsheet "CV urls indeed"
const SOURCE_SPREADSHEET_ID = '12j-32Gpij94_gfNDdBzSCT8yOlFfqCCYUlWZk4n1Qnk';
const SOURCE_SHEET_NAME = 'links';

// Name of the target file on Drive
const TARGET_FILE_NAME = 'urls.txt';

function fetchPendingUrlsAndAddToDrive() {
    // 1. Open Source Spreadsheet
    const ss = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SOURCE_SHEET_NAME);

    if (!sheet) {
        Logger.log(`Error: Sheet "${SOURCE_SHEET_NAME}" not found.`);
        return;
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
        Logger.log('Source sheet is empty or has only headers.');
        return;
    }

    // Read Columns E (Status) and F (ViewResumeLink)
    // Col E = index 5, Col F = index 6
    const range = sheet.getRange(2, 5, lastRow - 1, 2);
    const values = range.getValues(); // values[row][0] = Status, values[row][1] = URL

    // 2. Filter for Pending URLs
    const pendingUrls = [];
    for (let i = 0; i < values.length; i++) {
        const status = values[i][0];
        const url = values[i][1];

        // Check if URL exists and Status is NOT 'SUCCESS'
        if (url && String(url).trim() !== '' && status !== 'SUCCESS') {
            pendingUrls.push(url.trim());
        }
    }

    if (pendingUrls.length === 0) {
        Logger.log('No pending URLs found (all are SUCCESS or empty).');
        return;
    }

    Logger.log(`Found ${pendingUrls.length} pending URLs.`);

    // 3. Find urls.txt on Drive
    const files = DriveApp.getFilesByName(TARGET_FILE_NAME);
    let targetFile = null;

    while (files.hasNext()) {
        const file = files.next();
        if (file.getMimeType() === MimeType.PLAIN_TEXT) {
            targetFile = file;
            break;
        }
    }

    if (!targetFile) {
        Logger.log(`Error: Could not find "${TARGET_FILE_NAME}" on Drive.`);
        // Optional: Create it if it doesn't exist?
        // targetFile = DriveApp.createFile(TARGET_FILE_NAME, '');
        return;
    }

    // 4. Read existing content to avoid duplicates
    const currentContent = targetFile.getBlob().getDataAsString();
    const existingLines = currentContent.split('\n').map(l => l.trim()).filter(l => l !== '');
    const existingSet = new Set(existingLines);

    // 5. Append new unique URLs
    const newUrlsToAdd = [];
    for (const url of pendingUrls) {
        // Check if it's already in the file (ignoring ERROR- prefixes if you want, but simple check is best)
        // If the file has "ERROR-http...", and we have "http...", we might want to re-add it to try again?
        // Let's assume strict equality check for now.
        if (!existingSet.has(url)) {
            newUrlsToAdd.push(url);
            existingSet.add(url); // Add to set to avoid duplicates within the batch
        }
    }

    if (newUrlsToAdd.length > 0) {
        const newContentChunk = newUrlsToAdd.join('\n');
        // Append to file. 
        // Note: DriveApp doesn't have a simple "append" method for text files, 
        // we have to get content, add, and set content. 
        // For large files this is inefficient, but for text files it's usually okay.

        // Better approach: Use combined content
        const finalContent = currentContent + (currentContent.endsWith('\n') ? '' : '\n') + newContentChunk + '\n';
        targetFile.setContent(finalContent);

        Logger.log(`Added ${newUrlsToAdd.length} new URLs to ${TARGET_FILE_NAME}.`);
    } else {
        Logger.log('All pending URLs are already in urls.txt.');
    }
}
