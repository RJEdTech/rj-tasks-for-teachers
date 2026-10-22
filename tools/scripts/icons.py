"""Draws the RJ Tasks for Teachers icon: the RJ Tasks ring-and-check, in the
teacher colours (charcoal tile, Raider-red ring). Supersampled for clean edges."""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
S = 1024
CHAR, RED, WHITE, DIM = (42, 42, 42), (193, 20, 48), (255, 255, 255), (88, 88, 88)

def draw(size):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([40, 40, S - 40, S - 40], radius=200, fill=CHAR)
    box = [250, 250, S - 250, S - 250]
    w = 70
    d.arc(box, 0, 360, fill=DIM, width=w)
    d.arc(box, -90, 200, fill=RED, width=w)  # progress ring
    pts = [(395, 520), (480, 605), (640, 435)]
    d.line(pts, fill=WHITE, width=72, joint="curve")
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - 36, y - 36, x + 36, y + 36], fill=WHITE)
    return im.resize((size, size), Image.LANCZOS)

for n in (16, 32, 48, 128):
    draw(n).save(f"{OUT}/icon-{n}.png")
draw(300).save(f"{OUT}/logo-300.png")
