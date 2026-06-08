const puppeteer = require('puppeteer-core');

const X_USERNAME = process.env.X_SCREEN_NAME;
const X_PASSWORD = process.env.X_PASSWORD;
const X_EMAIL    = process.env.X_EMAIL;
const EXCLUDED_USERS = process.env.EXCLUDED_USERS
  ? process.env.EXCLUDED_USERS.split(',')
  : [];

const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function loginToX(page) {
  console.log('Navigating to login page...');
  await page.goto('https://x.com/i/flow/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(4000);

  // Step 1: Enter email/username
  try {
    await page.waitForSelector('input[autocomplete="username"]', { timeout: 15000 });
    await page.type('input[autocomplete="username"]', X_EMAIL, { delay: 80 });
    await page.keyboard.press('Enter');
    console.log('Entered email/username');
    await delay(3000);
  } catch (e) {
    console.log('Could not find username field:', e.message);
  }

  // Step 2: Handle any intermediate challenge (username or phone)
  try {
    const challengeInput = await page.$('input[data-testid="ocfEnterTextTextInput"]');
    if (challengeInput) {
      console.log('Intermediate challenge detected, entering username...');
      await challengeInput.type(X_USERNAME, { delay: 80 });
      await page.keyboard.press('Enter');
      await delay(3000);
    }
  } catch (e) {}

  // Step 3: Enter password - try multiple selectors
  console.log('Waiting for password field...');
  let passwordEntered = false;
  const passwordSelectors = [
    'input[autocomplete="current-password"]',
    'input[name="password"]',
    'input[type="password"]',
  ];
  for (const sel of passwordSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 8000 });
      await page.type(sel, X_PASSWORD, { delay: 80 });
      await page.keyboard.press('Enter');
      console.log('Password entered via selector:', sel);
      passwordEntered = true;
      break;
    } catch (e) {}
  }
  if (!passwordEntered) {
    throw new Error('Could not find password field!');
  }
  await delay(6000);
}

async function getUsersFromList(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await delay(4000);
  const users = new Set();
  let lastCount = 0;
  let sameCount = 0;
  while (sameCount < 3) {
    const handles = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/"]');
      const found = [];
      anchors.forEach(a => {
        const href = a.getAttribute('href');
        if (href && /^\/[a-zA-Z0-9_]+$/.test(href)) {
          const username = href.replace('/', '');
          if (!['home','explore','notifications','messages','settings','i','compose'].includes(username)) {
            found.push(username.toLowerCase());
          }
        }
      });
      return [...new Set(found)];
    });
    handles.forEach(h => users.add(h));
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await delay(3000);
    if (users.size === lastCount) {
      sameCount++;
    } else {
      sameCount = 0;
      lastCount = users.size;
    }
  }
  return users;
}

(async () => {
  console.log('Starting X.com Unfollow Bot (Puppeteer)...');
  const browser = await puppeteer.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    await loginToX(page);

    const currentUrl = page.url();
    console.log('After login URL:', currentUrl);
    if (currentUrl.includes('/login') || currentUrl.includes('/i/flow')) {
      throw new Error('Login seems to have failed, still on login page: ' + currentUrl);
    }
    console.log('Login successful!');

    // Collect following list
    console.log('Fetching following list...');
    const following = await getUsersFromList(page, `https://x.com/${X_USERNAME}/following`);
    console.log(`Following count: ${following.size}`);

    // Collect followers list
    console.log('Fetching followers list...');
    const followers = await getUsersFromList(page, `https://x.com/${X_USERNAME}/followers`);
    console.log(`Followers count: ${followers.size}`);

    // Find non-reciprocal
    const excluded = EXCLUDED_USERS.map(u => u.toLowerCase().trim());
    const nonReciprocal = [...following].filter(
      u => !followers.has(u) && !excluded.includes(u)
    );
    console.log(`Non-reciprocal accounts: ${nonReciprocal.length}`);

    // Unfollow each
    for (const username of nonReciprocal) {
      try {
        console.log(`Visiting @${username}...`);
        await page.goto(`https://x.com/${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await delay(2500);

        const followingBtn = await page.$('[data-testid$="-unfollow"]');
        if (followingBtn) {
          await followingBtn.click();
          await delay(1500);
          const confirmBtn = await page.$('[data-testid="confirmationSheetConfirm"]');
          if (confirmBtn) {
            await confirmBtn.click();
            console.log(`Unfollowed @${username}`);
          }
        } else {
          console.log(`No unfollow button found for @${username}`);
        }
        await delay(3000);
      } catch (err) {
        console.error(`Error processing @${username}: ${err.message}`);
      }
    }

    if (nonReciprocal.length === 0) {
      console.log('No non-reciprocal accounts found. All good!');
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    await browser.close();
    process.exit(1);
  }

  console.log('Bot finished successfully.');
  await browser.close();
})();
