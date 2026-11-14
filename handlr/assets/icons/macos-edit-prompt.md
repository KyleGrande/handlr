# Handlr macOS icon edit

Created with the built-in image generation tool. The macOS source image is
`../../../assets/icons/handlr-macos.png`. Other platform artwork is unchanged.

## Framing prompt

Edit image 1, the Handlr cyber chrome sheep macOS app icon. Image 2 is only a composition/zoom reference showing how large the sheep should be within its rounded square tile. Preserve image 1's exact character identity and design: black sheep profile facing left, polished chrome ram horn, cyan >- terminal eye with pink glow, soft silver tile. Only change the framing/scale of the sheep artwork INSIDE the tile so the sheep and chrome horn are substantially larger and sit higher, matching image 2's close-up composition. On the 1024 square canvas: keep rounded silver tile bounds around x=64..960 y=64..960, keep transparent outside; sheep ear and horn top should be around y=160..190 instead of y=310; nose left around x=150..180 y=450; chrome horn roughly 350px tall; sheep body fills and is cropped at right and bottom tile edges. Do not enlarge the outer tile or add more padding. Preserve the chrome reflective material and recognizable cyan/pink terminal eye. Smooth sharp professional icon edges. No text, no additional elements.

## Edge cleanup prompt

Clean up only the alpha silhouette of this macOS app icon. Keep the sheep, horn, cyan/pink terminal eye, silver background, framing, scale, and all interior pixels visually unchanged. Remove ALL stray white fragments, specks, halos, and debris outside the main rounded square tile. Outside the tile must be completely transparent. The main tile must have a perfectly clean smooth continuous rounded rectangle outline, symmetric corner radii, no shadow or fringe outside. Preserve the current enlarged sheep composition. Output a square transparent PNG app icon. Do not add or redesign anything.

## Packaging

The generated artwork is retained as `../../../assets/icons/handlr-macos-artwork.png`.
The editable `../../../assets/icons/handlr-macos.svg` applies a rounded rectangle
clip to remove stray pixels outside the tile. Render with:

```sh
rsvg-convert -w 1024 -h 1024 -o assets/icons/handlr-macos.png assets/icons/handlr-macos.svg
```

Run from the native repository root. The rendered PNG is resized into the
standard macOS iconset sizes with `sips`, then packaged with `iconutil` as
`assets/icons/Herdr.icns` and copied to `handlr/assets/icons/Handlr.icns`.
