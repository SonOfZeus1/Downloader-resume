# Indeed CV Downloader

Automated tool to download CVs from Indeed Employers using Playwright.

## Prerequisites

- Node.js (v18 or higher recommended)
- An Indeed Employers account

## Installation

```bash
npm install
npx playwright install
```

## Usage

### 1. First Time Login

You need to log in manually once to save your session.

```bash
npm run login
```

1. A browser window will open.
2. Log in to your Indeed account.
3. Once logged in, go back to your terminal and press **ENTER**.
4. The browser will close and a `storageState.json` file will be created.

### 2. Prepare URLs

Add the candidate profile URLs to `urls.txt`, one per line.

Example `urls.txt`:
```
https://employers.indeed.com/candidates/view?id=123456
https://employers.indeed.com/candidates/view?id=789012
```

### 3. Download CVs

Run the download script:

```bash
npm run download
```

The script will:
- Open each URL in headless mode using your saved session.
- Find and click the "Download resume" button.
- Save the PDF to the `downloads/` folder.

## Deployment (Render/Railway)

To deploy this as a scheduled job (cron):

1. **Service Type**: Background Worker or Cron Job.
2. **Build Command**: `npm install`
3. **Start Command**: `npm run download`
4. **Persistent Storage**: You MUST mount a persistent disk (e.g., `/data`) and symlink or configure the paths so `storageState.json` and `downloads/` are stored there.
   - Alternatively, run `npm run login` locally, commit/upload `storageState.json` (securely), or use a mechanism to inject the JSON content at runtime.
   - **Note**: `storageState.json` contains sensitive session cookies. Treat it like a password.

## Troubleshooting

- **Login fails**: Try deleting `storageState.json` and running `npm run login` again.
- **Download button not found**: Indeed may have changed their UI. Check the selectors in `download.js`.
