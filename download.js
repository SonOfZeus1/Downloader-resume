import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import path from 'path';

chromium.use(stealthPlugin());

const STORAGE_STATE_PATH = 'storageState.json';

const DOWNLOADS_DIR = 'downloads';

async function run() {
    // Ensure downloads directory exists
    await fs.ensureDir(DOWNLOADS_DIR);

    // Check if storage state exists (we use persistent profile now, but good check)
    if (!await fs.pathExists(STORAGE_STATE_PATH)) {
        console.error(`Error: ${STORAGE_STATE_PATH} not found. Please run 'npm run login' first.`);
        process.exit(1);
    }

    const USER_DATA_DIR = path.join(process.cwd(), 'chrome_profile'); // Same profile as login

    // Use persistent context to share exact session details
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false, // Cloudflare detects headless: true, so we must use false
        channel: 'chrome',
        viewport: null,
        acceptDownloads: true,
    });

    // Reuse existing page if available to avoid opening too many tabs
    // Persistent context usually has one page open
    let page = context.pages()[0];
    if (!page) page = await context.newPage();

    // --- CONFIGURATION ---
    // Path to your urls.txt file. 
    const URLS_FILE_PATH = '/Users/cbz/Desktop/Indeed CV download/Urls/urls.txt';
    // ---------------------

    if (!await fs.pathExists(URLS_FILE_PATH)) {
        console.error(`Error: urls.txt not found at ${URLS_FILE_PATH}`);
        await context.close();
        return;
    }

    // Read all lines
    let fileContent = await fs.readFile(URLS_FILE_PATH, 'utf-8');
    let lines = fileContent.split('\n');

    // Filter for pending URLs (lines starting with http)
    // We ignore lines starting with SUCCESS- or ERROR-
    let pendingItems = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('http')) {
            pendingItems.push({ originalIndex: i, url: line });
        }
    }

    console.log(`Found ${pendingItems.length} pending URLs out of ${lines.length} lines.`);

    // We process items one by one. 
    // Strategy: Read file -> Process -> Read file again -> Update specific line -> Write file.

    for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        const url = item.url;
        console.log(`[${i + 1}/${pendingItems.length}] Processing: ${url}`);

        let success = false;
        let errorDetails = '';

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for potential redirect
            try {
                await page.waitForURL(/.*employers\.indeed\.com.*/, { timeout: 30000, waitUntil: 'domcontentloaded' });
                console.log(`  Redirected to: ${page.url()}`);
            } catch (e) {
                console.log(`  Warning: Timeout waiting for redirect or already on target.`);
            }

            await page.waitForTimeout(5000);

            // Close chat/popups
            try {
                const closeChat = page.locator('button[aria-label*="Close"], button[aria-label*="Fermer"], button[aria-label*="Minimize"], [class*="chat"] button[class*="close"]');
                if (await closeChat.count() > 0) {
                    console.log('  Attempting to close chat/popup...');
                    await closeChat.first().click();
                    await page.waitForTimeout(1000);
                }
            } catch (e) { }

            // Find download button
            const selectors = [
                '[data-testid="download-resume-inline"]',
                'a[data-testid="download-resume-inline"]',
                'a[download]',
                'button:has-text("Download resume")',
                'button:has-text("Télécharger le CV")',
                'a:has-text("Download resume")',
                'a:has-text("Télécharger le CV")'
            ];

            let downloadButton = null;
            console.log('  Searching for download button...');

            for (const selector of selectors) {
                const el = page.locator(selector).first();
                if (await el.count() > 0 && await el.isVisible()) {
                    console.log(`  Found button on main page using: ${selector}`);
                    downloadButton = el;
                    break;
                }
            }

            if (!downloadButton) {
                for (const frame of page.frames()) {
                    for (const selector of selectors) {
                        const el = frame.locator(selector).first();
                        try {
                            if (await el.count() > 0 && await el.isVisible()) {
                                console.log(`  Found button in frame (${frame.url()}) using: ${selector}`);
                                downloadButton = el;
                                break;
                            }
                        } catch (e) { }
                    }
                    if (downloadButton) break;
                }
            }

            if (downloadButton) {
                console.log('  Download button found. Clicking...');
                await downloadButton.scrollIntoViewIfNeeded();

                const [download] = await Promise.all([
                    page.waitForEvent('download', { timeout: 60000 }),
                    downloadButton.click({ force: true })
                ]);

                let filename = `CV_${Date.now()}.pdf`;
                if (download.suggestedFilename()) {
                    filename = download.suggestedFilename();
                } else {
                    try {
                        const nameElement = await page.locator('h1').first();
                        const nameText = await nameElement.innerText();
                        if (nameText) {
                            const safeName = nameText.replace(/[^a-z0-9]/gi, '_').trim();
                            filename = `${safeName}_${Date.now()}.pdf`;
                        }
                    } catch (e) { }
                }

                const savePath = path.join(DOWNLOADS_DIR, filename);
                await download.saveAs(savePath);
                console.log(`  SUCCESS: Downloaded to ${savePath}`);

                success = true;

            } else {
                throw new Error('Download button not found');
            }

        } catch (error) {
            console.error(`  ERROR processing ${url}:`, error.message);
            success = false;
            errorDetails = error.message;

            // Debug screenshot
            const debugTimestamp = Date.now();
            try {
                await page.screenshot({ path: path.join(DOWNLOADS_DIR, `debug_screenshot_${debugTimestamp}.png`), fullPage: true });
                await fs.writeFile(path.join(DOWNLOADS_DIR, `debug_page_${debugTimestamp}.html`), await page.content());
            } catch (e) { }
        }

        // --- UPDATE FILES ---
        // Re-read file to get current state
        const currentContent = await fs.readFile(URLS_FILE_PATH, 'utf-8');
        const currentLines = currentContent.split('\n');

        // Find the line that matches our URL exactly
        const lineIndex = currentLines.findIndex(l => l.trim() === url);

        if (lineIndex !== -1) {
            if (success) {
                // Mark as SUCCESS in urls.txt
                currentLines[lineIndex] = `SUCCESS-${url}`;
                await fs.writeFile(URLS_FILE_PATH, currentLines.join('\n'), 'utf-8');
                console.log(`  Marked as SUCCESS in urls.txt`);
            } else {
                // Mark as ERROR in urls.txt
                currentLines[lineIndex] = `ERROR-${url}`;
                await fs.writeFile(URLS_FILE_PATH, currentLines.join('\n'), 'utf-8');
                console.log(`  Marked as ERROR- in urls.txt`);
            }
        } else {
            console.error(`  Warning: Could not find URL in file to update: ${url}`);
        }
    }

    await context.close();
    console.log('All done.');
}

run().catch(console.error);
