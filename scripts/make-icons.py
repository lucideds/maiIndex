"""Generate every icon size from one source image.

The header icon, favicon, apple-touch icon and PWA icons are the same artwork, so
they are derived here rather than edited by hand six times and left to drift.

    python3 scripts/make-icons.py <source.png>

"any" purpose icons are the source verbatim, as authored. The maskable icon is the
one exception: launchers crop maskable icons to a shape, and this artwork fills
96.5% of its canvas, so it is inset onto the theme colour to sit inside the 80%
safe zone. The artwork itself is not altered.
"""
import sys
from pathlib import Path

from PIL import Image

PUBLIC = Path(__file__).resolve().parent.parent / "frontend" / "public"
THEME = (14, 11, 13, 255)  # #0e0b0d, matches theme_color in index.html
SAFE_ZONE = 0.80

# name -> (size, maskable)
TARGETS = {
    "favicon.png": (64, False),
    "apple-touch-icon.png": (180, False),
    "pwa-192.png": (192, False),
    "pwa-512.png": (512, False),
    "pwa-maskable-512.png": (512, True),
}


def main() -> int:
    src = Path(sys.argv[1])
    if not src.is_file():
        print(f"no such file: {src}", file=sys.stderr)
        return 1
    art = Image.open(src).convert("RGBA")
    if art.size != (256, 256):
        print(f"warning: source is {art.size}, expected 256x256", file=sys.stderr)

    for name, (size, maskable) in TARGETS.items():
        out = art.resize((size, size), Image.Resampling.LANCZOS)
        if maskable:
            inset = int(size * SAFE_ZONE)
            scaled = art.resize((inset, inset), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (size, size), THEME)
            offset = (size - inset) // 2
            canvas.paste(scaled, (offset, offset), scaled)
            out = canvas
        out.save(PUBLIC / name, "PNG", optimize=True)
        print(f"  {name:<26} {size}x{size}{'  (maskable, art at 80%)' if maskable else ''}")

    print(f"wrote {len(TARGETS)} icons to {PUBLIC}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
