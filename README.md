# Amazon List Sidebar Extension for Firefox

A Firefox extension that replaces Amazon's tiny dropdown menu with a full sidebar for easier list management.

## Features

- **Full-height sidebar** - See all your lists at once, no more scrolling through tiny dropdowns
- **Search functionality** - Quickly find lists by typing part of their name
- **Large, readable text** - No more squinting at small text
- **Recently used lists** - Your most-used lists appear at the top
- **One-click adding** - Click any list to add the current product
- **Product preview** - See what you're adding with image and price

## Installation

1. Open Firefox and navigate to `about:debugging`
2. Click "This Firefox" in the left sidebar
3. Click "Load Temporary Add-on"
4. Navigate to the `amazon-list-sidebar` folder
5. Select the `manifest.json` file
6. The extension is now installed!

## Usage

1. Navigate to any Amazon product page
2. Click the "📚 Open List Sidebar" button (appears near the Add to Cart button)
3. The sidebar opens with all your lists
4. Click any list to add the current product
5. Use the search box to filter lists by name

## Important Notes

- You need to create PNG icons from the included `icon.svg` file (16x16, 48x48, 128x128 pixels)
- The extension needs to be reloaded in `about:debugging` after Firefox restarts
- For permanent installation, the extension needs to be signed by Mozilla

## Future Features (Phase 2)

- Cross-device sync using Firefox Sync
- Smart list ranking based on usage patterns
- Category organization
- Custom list grouping

## Troubleshooting

- **Lists not showing?** Make sure you're on an Amazon product page and click the "Open List Sidebar" button
- **Can't find the button?** Refresh the Amazon page after installing the extension
- **Lists not updating?** Click the refresh button (🔄) in the sidebar header

## Privacy

This extension:
- Only runs on Amazon domains
- Doesn't collect any personal data
- Stores recent list usage locally on your device
- Doesn't communicate with external servers