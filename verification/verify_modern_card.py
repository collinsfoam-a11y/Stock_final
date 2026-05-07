from playwright.sync_api import sync_playwright
import time
import json
import base64

def run_verification(page):
    # Mocking auth to bypass login
    auth_data = {
        "access_token": "fake-token",
        "refresh_token": "fake-refresh",
        "user": {
            "id": "123",
            "username": "palette",
            "full_name": "Palette UX",
            "role": "staff",
            "is_active": True,
            "permissions": ["scan"],
            "has_pin": True
        }
    }

    # We need to set this in localStorage
    page.goto("http://localhost:8081")
    page.wait_for_timeout(2000)

    page.evaluate(f"window.localStorage.setItem('auth_token', '{auth_data['access_token']}')")
    page.evaluate(f"window.localStorage.setItem('auth_user', JSON.stringify({json.dumps(auth_data['user'])}))")

    page.goto("http://localhost:8081/staff/home")
    page.wait_for_timeout(3000)

    # Take a screenshot of the home screen showing ModernCards
    page.screenshot(path="verification/screenshots/staff_home.png")

    # Try to find a ModernCard and click it
    # ModernCard with onPress has accessibilityRole="button"
    cards = page.get_by_role("button")
    if cards.count() > 0:
        # Hover over the first card to show interaction
        cards.nth(0).hover()
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/card_hover.png")

        # Click it
        cards.nth(0).click()
        page.wait_for_timeout(1000)

    page.screenshot(path="verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="verification/videos",
            viewport={'width': 390, 'height': 844} # iPhone 12 Pro size
        )
        page = context.new_page()
        try:
            run_verification(page)
        finally:
            context.close()
            browser.close()
