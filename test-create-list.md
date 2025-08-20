# Test Create List Feature

## Test Steps

1. **Open Firefox** and navigate to an Amazon product page (e.g., `https://www.amazon.com/dp/B08N5WRWNW`)

2. **Open the sidebar** by clicking the Amazon List Sidebar icon in the toolbar

3. **Click "Create New List" button** at the top of the sidebar
   - The button should hide
   - An input field should appear with Create/Cancel buttons

4. **Enter a list name** (e.g., "Test Shopping List")

5. **Click Create button**
   - You should see "Creating list..." message
   - The Amazon page should open the list dropdown
   - The create list modal should appear
   - The list name should be entered automatically
   - The list should be created

6. **Verify the new list appears** in the sidebar
   - The sidebar should refresh with the new list
   - You should see a success message

## Expected Behavior

- Create list UI should be responsive and user-friendly
- Orange "Create New List" button with + icon
- Form validation prevents empty list names
- Loading states during creation
- Success/error feedback messages
- Automatic refresh of lists after creation

## Files Modified

1. `/config/extension-config.js` - Added CREATE_LIST selectors and timings
2. `/sidebar/panel.html` - Added create list UI elements
3. `/sidebar/panel.css` - Added styling for create list components
4. `/content.js` - Added createNewList method with retry pattern:
   - Wrapped in RetryManager for 3 attempts
   - Forces fresh dropdown by closing any existing one first
   - Clicks "Create a List" link up to 10 times until modal appears
   - Sets input value with multiple event dispatches and verification
   - Clicks create button only ONCE to avoid duplicate lists
   - Improved `openListDropdownAndWait` to click up to 10 times
   - Added `forceNew` parameter to ensure fresh dropdown state
5. `/sidebar/panel.js` - Added create list logic and event handlers

## Troubleshooting

If the create list feature doesn't work:

1. Check browser console for errors (F12 > Console)
2. Ensure you're on a product page with the "Add to List" button
3. Check that the extension has proper permissions
4. Try refreshing the page and sidebar