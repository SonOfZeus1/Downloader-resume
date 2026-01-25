import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs-extra';

chromium.use(stealthPlugin());

const STORAGE_STATE_PATH = 'storageState.json';
const USER_DATA_DIR = path.join(process.cwd(), 'chrome_profile'); // Permanent profile folder

(async () => {
    console.log('Launching browser for manual login (Persistent Context)...');

    // Ensure the profile directory exists
    await fs.ensureDir(USER_DATA_DIR);

    // Launch persistent context - this looks much more like a real browser session to anti-bots
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: null,
        args: ['--disable-blink-features=AutomationControlled'] // Re-adding this just in case
        // The stealth plugin will automatically apply to this context
    });

    // Persistent context usually opens a page by default
    const page = context.pages()[0] || await context.newPage();

    try {
        console.log('Navigating to Indeed Employers...');
        await page.goto('https://employers.indeed.com', { waitUntil: 'domcontentloaded' });

        console.log('\n================================================================');
        console.log('INSTRUCTIONS:');
        console.log('1. Browser opened with a persistent profile.');
        console.log('2. Log in manually.');
        console.log('3. Once logged in, PRESS ENTER here.');
        console.log('================================================================\n');

        await new Promise(resolve => process.stdin.once('data', resolve));

        // We still save storageState as a backup, but the profile dir is the main thing now
        await context.storageState({ path: STORAGE_STATE_PATH });
        console.log(`Session saved.`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await context.close();
        // DO NOT delete the profile directory!
        process.exit(0);
    }
})();
