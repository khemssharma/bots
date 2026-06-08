#!/usr/bin/env python3
"""
x_unfollow_nonfollowers.py
==========================

Selenium automation that:
  1. Opens X.com in a *persistent* Chrome profile and waits for you to log in
     (only the first run needs a manual login -- the session is remembered).
  2. Scans your "Following" list and detects who does NOT follow you back
     (using X's built-in "Follows you" badge -- no need to scrape all followers).
  3. Unfollows those accounts, with random delays, a whitelist, and a per-run cap.

By default it runs in DRY-RUN mode and only PRINTS who it would unfollow.
Pass --execute to actually unfollow.

------------------------------------------------------------------------------
REQUIREMENTS
------------------------------------------------------------------------------
  - Python 3.8+
  - Google Chrome installed
  - pip install selenium>=4.10
    (Selenium 4.6+ auto-downloads the matching chromedriver, so no manual setup.)

------------------------------------------------------------------------------
TYPICAL USAGE
------------------------------------------------------------------------------
  # 1. First run -- preview only. A browser opens; log in when prompted.
  python x_unfollow_nonfollowers.py

  # 2. Once the preview looks right, actually unfollow (cap at 50 per run):
  python x_unfollow_nonfollowers.py --execute --max-unfollows 50

  # Keep certain accounts no matter what (one @handle per line, '#' = comment):
  python x_unfollow_nonfollowers.py --execute --whitelist whitelist.txt

------------------------------------------------------------------------------
NOTES & LIMITATIONS
------------------------------------------------------------------------------
  - Automating X.com may violate its Terms of Service; use conservatively.
  - The script relies on X's English UI ("Follows you" badge). If your UI is in
    another language, change FOLLOWS_YOU_TEXT below.
  - X changes its HTML often. If selectors break, the constants near the top of
    the file are the things to update.
"""

import argparse
import os
import random
import sys
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import (
    NoSuchElementException,
    TimeoutException,
    WebDriverException,
)

# --------------------------------------------------------------------------- #
# Things most likely to need tweaking if X changes its UI:
# --------------------------------------------------------------------------- #
FOLLOWS_YOU_TEXT = "Follows you"        # the badge text shown for mutuals
LOGIN_INDICATOR = '[data-testid="AppTabBar_Profile_Link"]'  # present when logged in
PROFILE_LINK = '[data-testid="AppTabBar_Profile_Link"]'     # href reveals your @handle
UNFOLLOW_BTN_IN_PROFILE = '[data-testid="primaryColumn"] [data-testid$="-unfollow"]'
CONFIRM_BTN = '[data-testid="confirmationSheetConfirm"]'

# JS that reads the currently-rendered Following list (X virtualizes the list,
# so we collect on every scroll step and accumulate results in Python).
EXTRACT_JS = r"""
const cells = document.querySelectorAll('[data-testid="UserCell"]');
return Array.from(cells).map(cell => {
  let handle = null;
  for (const s of cell.querySelectorAll('span')) {
    const t = s.textContent.trim();
    if (/^@[A-Za-z0-9_]{1,15}$/.test(t)) { handle = t.slice(1); break; }
  }
  let followsYou = false;
  for (const el of cell.querySelectorAll('span, div')) {
    if (el.textContent.trim() === arguments[0]) { followsYou = true; break; }
  }
  return handle ? { handle: handle, followsYou: followsYou } : null;
}).filter(Boolean);
"""


def build_driver(profile_dir: str) -> webdriver.Chrome:
    """Launch Chrome with a persistent profile so the login is remembered."""
    profile_dir = os.path.abspath(profile_dir)
    os.makedirs(profile_dir, exist_ok=True)

    opts = Options()
    opts.add_argument(f"--user-data-dir={profile_dir}")
    opts.add_argument("--window-size=1200,900")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    # Headless is intentionally NOT used: you need to see the page to log in.
    try:
        driver = webdriver.Chrome(options=opts)
    except WebDriverException as e:
        print("ERROR: could not start Chrome via Selenium.\n"
              "Make sure Google Chrome is installed and 'pip install selenium>=4.10'.\n"
              "Also ensure no other Chrome window is already using this profile dir.\n"
              f"Details: {e}")
        sys.exit(1)
    driver.set_page_load_timeout(60)
    return driver


def wait_for_login(driver: webdriver.Chrome, timeout: int = 300) -> None:
    """Open X and wait until the user is logged in (manual on first run)."""
    driver.get("https://x.com/home")
    print("\nA browser window has opened.")
    print("If you are not already logged in, please log in to X now.")
    print(f"Waiting up to {timeout}s for login to complete...")
    try:
        WebDriverWait(driver, timeout).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, LOGIN_INDICATOR))
        )
    except TimeoutException:
        print("Timed out waiting for login. Exiting.")
        driver.quit()
        sys.exit(1)
    print("Login detected.")


def detect_username(driver: webdriver.Chrome, override: str | None) -> str:
    """Figure out your own @handle from the profile nav link."""
    if override:
        return override.lstrip("@")
    try:
        link = driver.find_element(By.CSS_SELECTOR, PROFILE_LINK)
        href = link.get_attribute("href") or ""
        handle = href.rstrip("/").split("/")[-1]
        if handle:
            return handle
    except NoSuchElementException:
        pass
    handle = input("Could not auto-detect your username. Enter your @handle: ")
    return handle.strip().lstrip("@")


def scan_following(driver: webdriver.Chrome, username: str,
                   scroll_pause=(1.5, 3.0), stagnant_limit=8) -> dict:
    """Scroll the Following list and return {handle_lower: follows_you_bool}."""
    url = f"https://x.com/{username}/following"
    print(f"\nOpening {url}")
    driver.get(url)
    time.sleep(4)

    results: dict[str, bool] = {}
    stagnant = 0
    while stagnant < stagnant_limit:
        batch = driver.execute_script(EXTRACT_JS, FOLLOWS_YOU_TEXT)
        before = len(results)
        for item in batch:
            h = item["handle"].lower()
            # Once we've seen "follows you" true, keep it true.
            results[h] = results.get(h, False) or item["followsYou"]

        driver.execute_script(
            "window.scrollBy(0, Math.floor(window.innerHeight * 0.85));"
        )
        time.sleep(random.uniform(*scroll_pause))

        if len(results) == before:
            stagnant += 1
        else:
            stagnant = 0
            print(f"  collected {len(results)} accounts so far...")
    print(f"Done scanning. Total following collected: {len(results)}")
    return results


def unfollow(driver: webdriver.Chrome, handle: str, timeout=12) -> bool:
    """Visit a profile and unfollow. Returns True if an unfollow happened."""
    driver.get(f"https://x.com/{handle}")
    try:
        btn = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, UNFOLLOW_BTN_IN_PROFILE))
        )
    except TimeoutException:
        # No "Following" button found -> not following, suspended, or UI changed.
        print(f"  [skip] @{handle}: no unfollow button (already unfollowed?)")
        return False

    btn.click()
    try:
        confirm = WebDriverWait(driver, timeout).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, CONFIRM_BTN))
        )
        confirm.click()
    except TimeoutException:
        print(f"  [warn] @{handle}: clicked Following but no confirm dialog.")
        return False
    return True


def load_whitelist(path: str | None) -> set:
    wl = set()
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    wl.add(line.lstrip("@").lower())
        print(f"Loaded {len(wl)} whitelisted accounts.")
    return wl


def main():
    ap = argparse.ArgumentParser(
        description="Unfollow X.com accounts that don't follow you back.")
    ap.add_argument("--profile-dir", default="./x_profile",
                    help="Chrome profile dir (remembers your login).")
    ap.add_argument("--username", default=None,
                    help="Your @handle (auto-detected if omitted).")
    ap.add_argument("--whitelist", default=None,
                    help="File of @handles to never unfollow (one per line).")
    ap.add_argument("--execute", action="store_true",
                    help="Actually unfollow. Omit for a safe dry run.")
    ap.add_argument("--max-unfollows", type=int, default=0,
                    help="Cap per run (0 = no limit).")
    ap.add_argument("--min-delay", type=float, default=4.0,
                    help="Min seconds between unfollows.")
    ap.add_argument("--max-delay", type=float, default=9.0,
                    help="Max seconds between unfollows.")
    args = ap.parse_args()

    whitelist = load_whitelist(args.whitelist)
    driver = build_driver(args.profile_dir)

    try:
        wait_for_login(driver)
        username = detect_username(driver, args.username)
        print(f"Operating as @{username}")

        following = scan_following(driver, username)
        non_followers = sorted(
            h for h, follows_back in following.items()
            if not follows_back and h not in whitelist and h != username.lower()
        )

        print(f"\n{len(non_followers)} accounts do NOT follow you back"
              + (" (after whitelist)" if whitelist else "") + ":")
        for h in non_followers:
            print(f"  @{h}")

        if not args.execute:
            print("\nDRY RUN -- nothing was unfollowed. "
                  "Re-run with --execute to perform unfollows.")
            return

        targets = non_followers
        if args.max_unfollows > 0:
            targets = targets[:args.max_unfollows]

        confirm = input(f"\nUnfollow {len(targets)} accounts? Type 'yes' to proceed: ")
        if confirm.strip().lower() != "yes":
            print("Aborted.")
            return

        done = 0
        for h in targets:
            print(f"Unfollowing @{h} ...")
            if unfollow(driver, h):
                done += 1
            time.sleep(random.uniform(args.min_delay, args.max_delay))
        print(f"\nFinished. Unfollowed {done} of {len(targets)} targeted accounts.")

    finally:
        # Keep the window open briefly so you can see the final state.
        time.sleep(2)
        driver.quit()


if __name__ == "__main__":
    main()