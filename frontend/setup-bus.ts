// Lets the settings page reopen the first-run dialog without importing the
// entry module (which imports the settings page).
let opener: ((doc?: Document) => void) | null = null
export const setSetupOpener = (fn: (doc?: Document) => void) => { opener = fn }
export const openSetup = (doc?: Document) => opener?.(doc)
