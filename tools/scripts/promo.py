"""Small promotional tile for Edge Add-ons (440x280), matching the RJ Tasks for Students tile."""
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
ICON = sys.argv[2]
S = 2  # supersample
W, H = 440 * S, 280 * S
im = Image.new("RGB", (W, H), (42, 42, 42))
d = ImageDraw.Draw(im)
d.rectangle([0, H - 6 * S, W, H], fill=(193, 20, 48))
icon = Image.open(ICON).convert("RGBA").resize((96 * S, 96 * S), Image.LANCZOS)
im.paste(icon, (26 * S, 92 * S), icon)
bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
reg = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
d.text((156 * S, 80 * S), "RJ Tasks", font=ImageFont.truetype(bold, 32 * S), fill="white")
d.text((156 * S, 120 * S), "for Teachers", font=ImageFont.truetype(bold, 22 * S), fill="white")
f = ImageFont.truetype(reg, 13 * S)
d.text((156 * S, 160 * S), "What to grade, what to fix, and", font=f, fill=(205, 208, 214))
d.text((156 * S, 180 * S), "who to check on, in Canvas", font=f, fill=(205, 208, 214))
im.resize((440, 280), Image.LANCZOS).save(OUT)
