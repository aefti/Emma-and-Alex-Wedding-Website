# Photo manifest

`manifest.json` controls the photos used in the website:

- `mainPhoto`: image used in the **Our Story** block.
- `galleryPhotos`: six small images shown in the **Photo Gallery** block.

## Quick upload workflow

1. Upload your files into `images/photos/`.
2. Keep the default names to avoid editing code:
   - `main.jpg`
   - `small-1.jpg` through `small-6.jpg`
3. (Optional) If you use different names, update `backend/photos/manifest.json` paths.

The website fetches `backend/photos/manifest.json` on page load and automatically updates the photo sections.
