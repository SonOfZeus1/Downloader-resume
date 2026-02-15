import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs-extra';

chromium.use(stealthPlugin());

const STORAGE_STATE_PATH = 'storageStateGuichet.json';
const USER_DATA_DIR = path.join(process.cwd(), 'chrome_profile_guichet'); // Separate profile for Guichet

(async () => {
    console.log('Launching browser for Guichet Emplois manual login (Persistent Context)...');

    // Ensure the profile directory exists
    await fs.ensureDir(USER_DATA_DIR);

    // Launch persistent context
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: null,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        console.log('Navigating to Guichet Emplois Login...');
        // URL for login page
        await page.goto('https://employeur.guichetemplois.gc.ca/employer/', { waitUntil: 'domcontentloaded' });
        console.log('\n================================================================');
        console.log('INSTRUCTIONS (GUICHET EMPLOIS):');
        console.log('1. Browser opened with a persistent profile (chrome_profile_guichet).');
        console.log('2. Log in manually (CléGC, Partenaire, etc.).');
        console.log('3. Navigate until you are fully logged in and can see your dashboard.');
        console.log('4. Once logged in, PRESS ENTER here.');
        console.log('================================================================\n');

        await new Promise(resolve => process.stdin.once('data', resolve));

        // Save storage state as backup
        await context.storageState({ path: STORAGE_STATE_PATH });
        console.log(`Session saved to ${STORAGE_STATE_PATH}.`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await context.close();
        process.exit(0);
    }
})();
