import { google } from 'googleapis';
import fs from 'fs-extra';
import path from 'path';

// --- CONFIGURATION ---
const KEY_FILE_PATH = 'service_account_key.json'; // Will be created from env var
const DOWNLOADS_DIR = 'downloads';
// ---------------------

async function run() {
    // 1. Authenticate
    // We expect the service account JSON to be in an env var GDRIVE_CREDENTIALS or a file
    // For local dev, we might use a file. For CI, we use the env var and write to file or pass directly.

    let keyFile = KEY_FILE_PATH;
    if (process.env.GDRIVE_CREDENTIALS) {
        // Write the secret to a file if it doesn't exist
        await fs.writeFile(KEY_FILE_PATH, process.env.GDRIVE_CREDENTIALS);
    } else if (!await fs.pathExists(KEY_FILE_PATH)) {
        console.error('Error: No Google Drive credentials found (GDRIVE_CREDENTIALS env var or service_account_key.json).');
        process.exit(1);
    }

    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // 2. Get Target Folder ID
    const folderId = process.env.GDRIVE_FOLDER_ID;
    if (!folderId) {
        console.error('Error: GDRIVE_FOLDER_ID env var not set.');
        process.exit(1);
    }

    // 3. Scan Downloads
    if (!await fs.pathExists(DOWNLOADS_DIR)) {
        console.log('No downloads directory found.');
        return;
    }

    const files = await fs.readdir(DOWNLOADS_DIR);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`Found ${pdfFiles.length} PDF files to upload.`);

    for (const fileName of pdfFiles) {
        const filePath = path.join(DOWNLOADS_DIR, fileName);

        try {
            console.log(`Uploading ${fileName}...`);
            const fileMetadata = {
                name: fileName,
                parents: [folderId]
            };
            const media = {
                mimeType: 'application/pdf',
                body: fs.createReadStream(filePath)
            };

            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id'
            });

            console.log(`  Success! File ID: ${response.data.id}`);

            // Optional: Delete local file after upload?
            // await fs.remove(filePath); 

        } catch (error) {
            console.error(`  Error uploading ${fileName}:`, error.message);
        }
    }

    // Cleanup key file if created from env
    if (process.env.GDRIVE_CREDENTIALS) {
        await fs.remove(KEY_FILE_PATH);
    }
}

run().catch(console.error);
