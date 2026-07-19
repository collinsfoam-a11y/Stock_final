import pytest
from playwright.sync_api import Page, expect

BASE_URL = "http://localhost:8081"

@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "viewport": {
            "width": 1280,
            "height": 800,
        }
    }

def test_staff_login_and_dashboard(page: Page):
    """
    Test that a staff user can log in and view the dashboard.
    """
    # 1. Navigate to login
    page.goto(f"{BASE_URL}/login")
    
    # 2. Wait for page load
    page.wait_for_timeout(1000)
    
    # 3. If "Use Username & Password" is visible (meaning we are on PIN mode), click it
    if "Use Username & Password" in page.inner_text("body"):
        page.click("text=Use Username & Password")
        page.wait_for_timeout(500)
        
    # 4. Fill credentials
    page.fill("[placeholder='Enter your username']", "staff1")
    page.fill("[placeholder='Enter your password']", "staff123")
    
    # 5. Submit login
    buttons = page.locator("text=Sign In").all()
    if buttons:
        buttons[-1].click()
        
    # 6. Verify dashboard elements
    page.wait_for_timeout(3000)
    body_text = page.inner_text("body")
    
    assert "Stock Verify" in body_text, "Header 'Stock Verify' missing"
    assert "Staff Member" in body_text, "Header 'Staff Member' missing"
    assert "Start New Session" in body_text, "Start New Session button missing"
