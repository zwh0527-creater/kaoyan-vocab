from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/System/Library/Fonts/Supplemental/Songti.ttc",
]


def font_for(size: int):
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size, index=0)
    return ImageFont.load_default()


def make_icon(size: int, filename: str, maskable: bool = False):
    background = "#F3EFE5"
    ink = "#24211D"
    accent = "#9E3E35"
    image = Image.new("RGB", (size, size), background)
    draw = ImageDraw.Draw(image)
    margin = int(size * (0.20 if maskable else 0.13))
    stroke = max(2, int(size * 0.012))
    draw.ellipse((margin, margin, size - margin, size - margin), outline=ink, width=stroke)
    font = font_for(int(size * 0.42))
    text = "词"
    box = draw.textbbox((0, 0), text, font=font)
    x = (size - (box[2] - box[0])) / 2
    y = (size - (box[3] - box[1])) / 2 - box[1] - size * 0.012
    draw.text((x, y), text, font=font, fill=accent)
    image.save(PUBLIC / filename, optimize=True)


PUBLIC.mkdir(parents=True, exist_ok=True)
make_icon(192, "pwa-192.png")
make_icon(512, "pwa-512.png")
make_icon(512, "pwa-maskable-512.png", maskable=True)
make_icon(180, "apple-touch-icon.png")
