#!/usr/bin/env python3
"""Bake the game's two bitmaps from raw image-generator output.

The textures in `src/render/textures/` are not hand-painted and they are not
straight generator output either: both need processing before they are usable as
game textures, and that processing is the reason this script exists rather than
just the binaries. Re-tune a constant here and rebake instead of guessing what
was done.

Usage:
    python3 tools/bake-textures.py rock.png nebula.png

`rock.png` and `nebula.png` are whatever the generator produced from the prompts
below, at any resolution. Outputs are written straight into
`src/render/textures/`. Needs `pillow` and `numpy`, neither of which the game
itself depends on - this runs once per texture change, not on build.

The prompts, kept here so a rebake starts from the same place:

ROCK (square, PNG, highest resolution available)
    Seamless tileable square texture of dark slate-blue cavern rock, for use as
    a PBR albedo map in a video game. Completely flat even ambient lighting: no
    directional shadows, no visible light source, no highlights, no vignette, no
    border. Fine granite grain with subtle fracture lines, hairline cracks and
    small pale mineral flecks. Desaturated cold navy-grey palette, roughly
    #2b3d55 to #4a648c, uniform average brightness across the entire square so
    it tiles invisibly. Left edge matches right edge and top edge matches bottom
    edge so the pattern repeats. Top-down orthographic view, no perspective, no
    text, no watermark.

NEBULA (21:9, PNG)
    Ultrawide deep-space parallax backdrop for a dark 2D cave-flyer game.
    Near-black navy void, roughly #060a14, with a faint cold blue and indigo
    nebula bloom drifting across it and soft wisps of interstellar dust. Sparse
    tiny white and pale-cyan pinprick stars, no lens flares, no star spikes.
    Very dark and very low contrast overall so that bright foreground sprites
    stay readable on top of it; no bright hotspots, nothing near white except
    the smallest stars. Subtle teal-to-violet colour variation. No planets, no
    spacecraft, no horizon, no text, no watermark. Understated painterly
    astrophotography look.

A model will claim the result is seamless. Measure it - the first pass here was
out by a fifth of a tone across the wrap - which is what `wrap_blend` fixes.
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parent.parent / 'src' / 'render' / 'textures'

# --- rock grain -------------------------------------------------------------
# Must stay in step with ROCK_GRAIN_MEAN in src/render/textures.ts: the map is a
# multiplier averaging this much in linear light, and the rock material carries
# the reciprocal so the texture adds grain without darkening the palette.
ROCK_MEAN = 0.72
# Fraction of the photo's relative variation kept. Higher reads as noise at the
# ~26 px a tile actually covers on screen.
ROCK_CONTRAST = 0.70
# Percentile above which highlights are flattened. The generated mineral flecks
# are a few pixels wide in a 128 px crop; left alone they alias into hard white
# dots that read as stars sitting on the stone rather than as mineral in it.
ROCK_FLECK_CLAMP = 95.0
ROCK_SIZE = 512
ROCK_QUALITY = 84

# --- nebula -----------------------------------------------------------------
NEBULA_HEIGHT = 576
NEBULA_QUALITY = 82


def to_linear(a: np.ndarray) -> np.ndarray:
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def to_srgb(a: np.ndarray) -> np.ndarray:
    a = np.clip(a, 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055) * 255.0


def wrap_blend(a: np.ndarray, axis: int, frac: float) -> np.ndarray:
    """Crop-and-blend `a` so it tiles seamlessly along `axis`.

    The leading `band` rows/columns are cross-faded with the trailing ones and
    the trailing band is then dropped, so the new first line continues from the
    new last line exactly. Costs `frac` of the image and needs no tricks at
    sample time.
    """
    n = a.shape[axis]
    band = int(n * frac)
    a = np.moveaxis(a, axis, 0)
    ramp = (np.arange(band, dtype=np.float32) / band)[:, None, None]
    faded = a[:band] * ramp + a[n - band:] * (1.0 - ramp)
    return np.moveaxis(np.concatenate([faded, a[band:n - band]]), 0, axis)


def seam_report(a: np.ndarray, label: str) -> None:
    """Seam error against the interior noise floor. At or below it is seamless."""
    mid = a.shape[1] // 2
    print(
        f'  {label}: wrap error L/R {np.abs(a[:, 0] - a[:, -1]).mean():.2f}  '
        f'T/B {np.abs(a[0, :] - a[-1, :]).mean():.2f}  '
        f'(interior neighbours {np.abs(a[:, mid] - a[:, mid + 1]).mean():.2f})'
    )


def bake_rock(src: Path) -> None:
    print(f'rock  <- {src}')
    a = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32)

    # Flatten low-frequency brightness drift first, or tiled copies show
    # blotches wherever the generator lit one corner more than another.
    from PIL import ImageFilter
    lo = np.asarray(
        Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(40)),
        dtype=np.float32,
    )
    a = np.clip(a - 0.85 * (lo - lo.mean(axis=(0, 1))), 0, 255)
    a = wrap_blend(wrap_blend(a, 1, 0.12), 0, 0.12)

    # Downscale *before* normalising, not after. The generator works at a
    # resolution far above what a tile ever samples, and the contrast of detail
    # that the resize is about to average away is not the contrast we are trying
    # to hit - measured at full size the same settings come out at 33% grain and
    # clip an eighth of the image.
    a = np.asarray(
        Image.fromarray(a.astype(np.uint8)).resize((ROCK_SIZE, ROCK_SIZE), Image.LANCZOS),
        dtype=np.float32,
    )
    seam_report(a, 'seams')

    # Per-channel normalisation neutralises the blue cast - the palette lives in
    # terrain.ts and must not be applied twice - while keeping local chroma, so
    # the mineral flecks stay cool.
    lin = to_linear(a)
    ratio = lin / lin.mean(axis=(0, 1), keepdims=True)
    ratio = np.minimum(ratio, np.percentile(ratio, ROCK_FLECK_CLAMP))
    r = 1.0 + (ratio - 1.0) * ROCK_CONTRAST
    r *= ROCK_MEAN / r.mean()
    print(
        f'  multiplier: mean {r.mean():.4f} (target {ROCK_MEAN})  '
        f'min {r.min():.3f}  max {r.max():.3f}  '
        f'clipped {(r > 1.0).mean() * 100:.3f}%  '
        f'grain {r.std() / r.mean() * 100:.1f}%'
    )
    if r.max() > 1.0:
        print('  WARNING: highlights clip - lower ROCK_MEAN or ROCK_CONTRAST')

    dst = OUT / 'rock-grain.webp'
    img = Image.fromarray(to_srgb(r).astype(np.uint8))
    img.save(dst, 'WEBP', quality=ROCK_QUALITY, method=6)
    print(f'  -> {dst.name}  {dst.stat().st_size / 1024:.0f} kB  {img.size}')


def bake_nebula(src: Path) -> None:
    print(f'nebula <- {src}')
    a = np.asarray(Image.open(src).convert('RGB'), dtype=np.float32)
    # Both axes: the sheet repeats in X across a wide level and in Y once the
    # parallax offset drags it, so a vertical seam would show just as much.
    a = wrap_blend(wrap_blend(a, 1, 0.10), 0, 0.16)
    seam_report(a, 'seams')

    # Even width and height keep the mip chain clean.
    w = int(a.shape[1] * NEBULA_HEIGHT / a.shape[0] / 2) * 2
    dst = OUT / 'nebula.webp'
    img = Image.fromarray(a.astype(np.uint8)).resize((w, NEBULA_HEIGHT), Image.LANCZOS)
    img.save(dst, 'WEBP', quality=NEBULA_QUALITY, method=6)
    print(f'  -> {dst.name}  {dst.stat().st_size / 1024:.0f} kB  {img.size}')


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    bake_rock(Path(sys.argv[1]))
    bake_nebula(Path(sys.argv[2]))
    print('\nRemember: changing ROCK_MEAN means changing ROCK_GRAIN_MEAN in')
    print('src/render/textures.ts, or the cave changes brightness.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
