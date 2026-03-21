from __future__ import annotations

import os
from pathlib import Path

import fitz
from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT / "assets" / "images"
ANDROID_RES_DIR = ROOT / "android" / "app" / "src" / "main" / "res"
DEFAULT_BRAND_BOOK = Path(r"C:\Users\mknou\OneDrive\Desktop\LAVANYA E MART LOGO BOOK.pdf")


def trim_white(image: Image.Image, padding: int = 0) -> Image.Image:
    background = Image.new("RGBA", image.size, (255, 255, 255, 255))
    difference = ImageChops.difference(image, background)
    bbox = difference.getbbox()
    if bbox is None:
        return image
    left = max(0, bbox[0] - padding)
    top = max(0, bbox[1] - padding)
    right = min(image.width, bbox[2] + padding)
    bottom = min(image.height, bbox[3] + padding)
    return image.crop((left, top, right, bottom))


def white_to_alpha(image: Image.Image, threshold: int = 245) -> Image.Image:
    converted = image.convert("RGBA")
    pixels = []
    for red, green, blue, alpha in converted.getdata():
        if red >= threshold and green >= threshold and blue >= threshold:
            pixels.append((255, 255, 255, 0))
        else:
            pixels.append((red, green, blue, alpha))
    converted.putdata(pixels)
    return converted


def crop_page_region(
    page_image: Image.Image,
    region: tuple[int, int, int, int],
    *,
    padding: int = 0,
    transparent: bool = True,
) -> Image.Image:
    cropped = page_image.crop(region).convert("RGBA")
    trimmed = trim_white(cropped, padding=padding)
    return white_to_alpha(trimmed) if transparent else trimmed


def build_icon_from_symbol(symbol: Image.Image, size: int, inset: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    inner = symbol.copy()
    inner.thumbnail((size - inset * 2, size - inset * 2), Image.Resampling.LANCZOS)
    x = (size - inner.width) // 2
    y = (size - inner.height) // 2
    canvas.alpha_composite(inner, (x, y))
    return canvas


def render_page_image(document: fitz.Document, page_index: int, scale: float) -> Image.Image:
    page = document.load_page(page_index)
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
    return Image.frombytes("RGB", [pixmap.width, pixmap.height], pixmap.samples).convert("RGBA")


def save_android_icons(icon: Image.Image) -> None:
    sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, size in sizes.items():
        resized = icon.resize((size, size), Image.Resampling.LANCZOS)
        target_dir = ANDROID_RES_DIR / folder
        resized.save(target_dir / "ic_launcher.webp", format="WEBP", quality=100, method=6)
        resized.save(target_dir / "ic_launcher_round.webp", format="WEBP", quality=100, method=6)


def main() -> None:
    pdf_path = Path(os.environ.get("BRAND_BOOK_PDF", str(DEFAULT_BRAND_BOOK)))
    if not pdf_path.exists():
        raise FileNotFoundError(f"Brand book PDF not found: {pdf_path}")

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    document = fitz.open(pdf_path)
    page_one = render_page_image(document, page_index=0, scale=3.5)
    page_two = render_page_image(document, page_index=1, scale=2.5)

    wordmark_tagline = crop_page_region(page_one, (760, 760, 3040, 1420))
    wordmark_plain = crop_page_region(page_two, (1310, 1570, 2630, 2130))
    symbol = crop_page_region(page_two, (1330, 1630, 1830, 2110))

    wordmark_tagline.save(ASSETS_DIR / "brand-wordmark-tagline.png")
    wordmark_plain.save(ASSETS_DIR / "brand-wordmark.png")
    symbol.save(ASSETS_DIR / "brand-symbol.png")

    adaptive_foreground = symbol.copy()
    adaptive_foreground.thumbnail((760, 760), Image.Resampling.LANCZOS)
    adaptive_canvas = Image.new("RGBA", (1024, 1024), (255, 255, 255, 0))
    adaptive_canvas.alpha_composite(
        adaptive_foreground,
        ((1024 - adaptive_foreground.width) // 2, (1024 - adaptive_foreground.height) // 2),
    )
    adaptive_canvas.save(ASSETS_DIR / "brand-adaptive-foreground.png")

    icon = build_icon_from_symbol(symbol, size=1024, inset=130)
    icon.save(ASSETS_DIR / "brand-icon.png")
    save_android_icons(icon)


if __name__ == "__main__":
    main()
