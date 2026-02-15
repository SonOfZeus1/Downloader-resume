import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs-extra';
import path from 'path';

chromium.use(stealthPlugin());

const STORAGE_STATE_PATH = 'storageStateGuichet.json';

// --- CONFIGURATION ---
// Nouveau dossier racine pour les téléchargements Guichet
const DOWNLOADS_ROOT = 'downloads 2';
// Fichier contenant la liste des numéros d'offres (IDs)
const IDS_FILE_PATH = path.join(process.cwd(), 'Urls', 'ids_offres_guichet.txt');
// ---------------------

async function run() {
    // Ensure root downloads directory exists
    await fs.ensureDir(DOWNLOADS_ROOT);

    const USER_DATA_DIR = path.join(process.cwd(), 'chrome_profile_guichet');

    // 1. Launch persistent context
    const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: null,
        acceptDownloads: true,
    });

    // 2. Restore Cookies
    if (await fs.pathExists(STORAGE_STATE_PATH)) {
        try {
            const state = await fs.readJson(STORAGE_STATE_PATH);
            if (state.cookies) {
                console.log(`Restoring ${state.cookies.length} cookies...`);
                await context.addCookies(state.cookies);
            }
        } catch (e) { console.error('Cookie restore warning:', e); }
    }

    let page = context.pages()[0];
    if (!page) page = await context.newPage();

    // 3. Read Job IDs
    if (!await fs.pathExists(IDS_FILE_PATH)) {
        console.error(`Error: IDs file not found at ${IDS_FILE_PATH}`);
        await context.close();
        return;
    }

    let fileContent = await fs.readFile(IDS_FILE_PATH, 'utf-8');
    // Filter lines that are numeric or at least look like IDs, ignoring SUCCESS/ERROR prefixes for clean re-runs if manually cleaned,
    // actually user asked for ID input. We will assume the file contains just IDs or "SUCCESS-ID".
    let lines = fileContent.split('\n');
    let jobIds = [];

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        // Remove prefixes if present to get the raw ID
        line = line.replace(/^(SUCCESS-|ERROR-)/, '');

        // Simple check: is it non-empty?
        if (line.length > 0) {
            jobIds.push({ originalIndex: i, id: line });
        }
    }

    console.log(`Found ${jobIds.length} Job IDs to process.`);

    for (const jobItem of jobIds) {
        const jobId = jobItem.id;
        console.log(`\n=== Processing Job ID: ${jobId} ===`);

        // Construct URL
        const jobUrl = `https://employeur.guichetemplois.gc.ca/employer/jumelage/resume/${jobId}`;

        // Create Subfolder for this Job ID
        const jobDownloadDir = path.join(DOWNLOADS_ROOT, jobId);
        await fs.ensureDir(jobDownloadDir);
        console.log(`   Target folder: ${jobDownloadDir}`);

        let jobSuccess = true;

        try {
            await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(3000);

            // Check if we are on a list page or redirected elsewhere
            if (page.url().includes('login')) {
                console.error('   Error: Redirected to login. Session might be expired.');
                jobSuccess = false;
            } else {
                // Find candidates
                // Logic: Scan for links containing "/resume/{jobId}/"
                // The pattern is typically .../resume/JOBID/CANDIDATEID

                // --- PAGINATION LOOP ---
                const links = await page.locator(`a[href*="/resume/${jobId}/"]`).all();
                let candidateUrls = [];

                // Helper to add links
                const addLinks = async () => {
                    const pageLinks = await page.locator(`a[href*="/resume/${jobId}/"]`).all();
                    for (const link of pageLinks) {
                        const href = await link.getAttribute('href');
                        if (href) {
                            const absUrl = new URL(href, page.url()).toString();
                            if (!candidateUrls.includes(absUrl)) {
                                candidateUrls.push(absUrl);
                            }
                        }
                    }
                };

                await addLinks(); // First page

                // Try to find "Check next page" button
                // Common selectors: "Suivant", "Next", or generic pagination controls.
                // Guichet often uses "Suivant" button or link.
                // We'll loop up to 50 pages max to be safe.
                for (let p = 0; p < 50; p++) {
                    const nextBtn = page.locator('a:has-text("Suivant"), button:has-text("Suivant"), a[aria-label="Suivant"], a[rel="next"]').first();
                    if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
                        console.log(`   Navigating to page ${p + 2}...`);
                        await nextBtn.click();
                        await page.waitForLoadState('domcontentloaded');
                        await page.waitForTimeout(2000); // Wait for list reload
                        await addLinks();
                    } else {
                        break; // No more pages
                    }
                }
                // -----------------------

                console.log(`   Found ${candidateUrls.length} candidates for Job ${jobId}.`);

                for (let j = 0; j < candidateUrls.length; j++) {
                    const candUrl = candidateUrls[j];
                    console.log(`   [${j + 1}/${candidateUrls.length}] Candidate: ${candUrl}`);
                    try {
                        await processCandidate(page, candUrl, jobDownloadDir);
                    } catch (e) {
                        console.error(`     Error downloading candidate: ${e.message}`);
                        // We continue with next candidate, but might mark job as partial?
                    }
                }
            }

        } catch (e) {
            console.error(`   Error processing Job ${jobId}: ${e.message}`);
            jobSuccess = false;
        }

        // Update status in file? 
        // The user didn't explicitly ask for SUCCESS-ID update in the file today, but it's good practice.
        // However, since we might re-run endlessly, maybe we just log it. 
        // I will update the line with SUCCESS-ID just so they track it.

        /* 
        // Optional: Update status in file (commented out to keep file clean for now unless requested)
        // lines[jobItem.originalIndex] = (jobSuccess ? 'SUCCESS-' : 'ERROR-') + jobId;
        */
    }

    /*
    // Optional: Write back to file
    // await fs.writeFile(IDS_FILE_PATH, lines.join('\n'), 'utf-8');
    */

    console.log('\nAll done.');
    await context.close();
}

async function processCandidate(page, url, downloadDir) {
    if (page.url() !== url) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
    }

    let metadata = { url: url, extractionDate: new Date().toISOString() };
    let finalFilenameBase = `CV_${Date.now()}`;

    // METADATA
    try {
        const headerEl = page.locator('main h1, h1').first();
        if (await headerEl.count() > 0) {
            const txt = await headerEl.innerText();
            metadata.fullTitle = txt.trim();
        }

        const section = page.locator('h2:has-text("Renseignements sur le candidat"), h3:has-text("Renseignements sur le candidat")');
        if (await section.count() > 0) {
            const parent = section.locator('xpath=..');
            const txt = await parent.innerText();
            metadata.rawInfo = txt;
            const emailMatch = txt.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
            if (emailMatch) metadata.email = emailMatch[0];

            const statLabel = "Statut juridique";
            const idx = txt.indexOf(statLabel);
            if (idx !== -1) {
                const part = txt.substring(idx + statLabel.length);
                const lines = part.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (lines.length > 0) metadata.legalStatus = lines[0];
            }
        }

        // Questions
        const qHeader = page.locator('h2:has-text("Questions de présélection"), h3:has-text("Questions de présélection")');
        if (await qHeader.count() > 0) {
            const parent = qHeader.locator('xpath=..');
            const table = parent.locator('table').first();
            if (await table.count() > 0) {
                const rows = await table.locator('tbody tr').all();
                let qList = [];
                for (const r of rows) {
                    const cells = await r.locator('td, th').allInnerTexts();
                    if (cells.length >= 2) qList.push({ q: cells[0], a: cells[1] });
                }
                metadata.questions = qList;
            }
        }

        if (metadata.fullTitle) {
            const safe = metadata.fullTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            finalFilenameBase = `CV_${safe}_${Date.now()}`;
        }

    } catch (e) {
        metadata.error = e.message;
    }

    // JSON Save
    await fs.writeJson(path.join(downloadDir, `${finalFilenameBase}.json`), metadata, { spaces: 2 });

    // PDF Download
    const docSection = page.locator('h2:has-text("Documents de candidature"), h3:has-text("Documents de candidature")');
    let downloadBtn = null;

    if (await docSection.count() > 0) {
        const container = docSection.locator('xpath=..');
        const btn = container.locator('a[href*="download"], a[href*="resume"], button, a:has-text("Télécharger")').first();
        if (await btn.count() > 0 && await btn.isVisible()) downloadBtn = btn;
    }

    if (!downloadBtn) {
        // Fallback
        const sel = ['a:has-text("Télécharger le CV")', 'button:has-text("Télécharger le CV")', '[class*="download"]'];
        for (const s of sel) {
            const el = page.locator(s).first();
            if (await el.count() > 0 && await el.isVisible()) {
                downloadBtn = el;
                break;
            }
        }
    }

    if (downloadBtn) {
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }),
            downloadBtn.click()
        ]);
        await dl.saveAs(path.join(downloadDir, `${finalFilenameBase}.pdf`));
        console.log(`     -> Saved PDF: ${finalFilenameBase}.pdf`);
    } else {
        console.error('     -> Download button not found');
    }
}

run().catch(console.error);
