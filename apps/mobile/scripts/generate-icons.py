#!/usr/bin/env python3
"""Derive Kairo's image assets from the source mark.

    python3 scripts/generate-icons.py

Reads `assets/source/kairo-mark.png` — the artwork as supplied, kept in the repository so these
outputs are reproducible rather than binaries of unknown provenance — and writes:

    assets/logo.png           trimmed, for `src/components/Logo.tsx` (intro, loader, headers)
    assets/icon.png           1024 full-bleed launcher icon on the app background
    assets/adaptive-icon.png  1024 Android foreground, transparent, inside the mask safe zone

Two things it does beyond resizing, both consequences of how the art is drawn:

The mark's interior detail is *opaque pure black*, not transparency — roughly half its opaque
pixels. That is why it only reads on a dark field, and it is also a seam: pure black against the
app's `#0B0D10` background is a faintly darker silhouette on an OLED panel. So near-black pixels
are recoloured to the background exactly, and the outer transparency is left alone.

It is also tall (about 0.58 wide for its height), so it is fitted by its longest side with margin
rather than scaled to fill — a square fit would crop the plume or the neck.

Pillow is a development-time requirement and deliberately not a project dependency.
"""

from __future__ import annotations

import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, os.pardir, "assets"))
SOURCE = os.path.join(ASSETS, "source", "kairo-mark.png")

# colors.background from src/theme/index.ts. The interior black becomes exactly this.
BACKGROUND = (0x0B, 0x0D, 0x10)
# Anything darker than this on every channel is interior detail rather than artwork.
BLACK_CEILING = 40

ICON_SIZE = 1024
# Fraction of the icon's height the mark occupies. The mark is tall and narrow, so its corners are
# empty and an iOS squircle or an Android circular crop takes nothing from it — 0.80 is what keeps
# the helmet's interior lines legible at a 48px launcher tile, and the fit was raised to 0.80 for
# exactly that reason.
ICON_FIT = 0.80
# Android composes this over `adaptiveIcon.backgroundColor` and may crop to a circle. The launcher
# also zooms the foreground — only the central 72 of its 108dp canvas is ever visible — so 0.56
# here renders at roughly the same size as the 0.80 legacy icon above, and still sits inside the
# 66dp safe circle top to bottom.
ADAPTIVE_FIT = 0.56
# Enough for the 112px intro mark at a 3x pixel ratio, without shipping a megabyte.
LOGO_MAX_SIDE = 512


def load_source() -> Image.Image:
    """The artwork, trimmed to its ink and with its interior black matched to the background."""
    image = Image.open(SOURCE).convert("RGBA")
    box = image.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box is None:
        raise SystemExit(f"{SOURCE} is fully transparent")
    image = image.crop(box)

    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a > 8 and max(r, g, b) <= BLACK_CEILING:
                pixels[x, y] = (*BACKGROUND, a)
    return image


def fit(mark: Image.Image, size: int, ratio: float) -> Image.Image:
    """`mark` centred on a transparent square of `size`, its longest side at `ratio` of it."""
    target = size * ratio
    scale = target / max(mark.size)
    scaled = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))), Image.LANCZOS
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(scaled, ((size - scaled.width) // 2, (size - scaled.height) // 2))
    return canvas


def main() -> None:
    mark = load_source()
    print(f"source {os.path.relpath(SOURCE, ASSETS)}: trimmed to {mark.width}x{mark.height}")

    scale = LOGO_MAX_SIDE / max(mark.size)
    logo = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.LANCZOS)
    logo.save(os.path.join(ASSETS, "logo.png"))

    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (*BACKGROUND, 255))
    icon.alpha_composite(fit(mark, ICON_SIZE, ICON_FIT))
    icon.save(os.path.join(ASSETS, "icon.png"))

    fit(mark, ICON_SIZE, ADAPTIVE_FIT).save(os.path.join(ASSETS, "adaptive-icon.png"))

    print(f"logo.png          {logo.width}x{logo.height}")
    print(f"icon.png          {ICON_SIZE}x{ICON_SIZE} on #%02X%02X%02X" % BACKGROUND)
    print(f"adaptive-icon.png {ICON_SIZE}x{ICON_SIZE} transparent")


if __name__ == "__main__":
    main()
