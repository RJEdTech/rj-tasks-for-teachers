export const PRODUCT_NAME = 'RJ Tasks for Teachers';

/* The only Canvas site this extension works on. The manifest limits the
   content script to it too; canvasApi.ts checks again before every request. */
export const ALLOWED_ORIGINS = ['https://rjhs.instructure.com'];

/* Bug reports and feature requests: the RJ Tasks for Teachers Microsoft Form
   (RJ sign-in required). Opened in a new tab from the popup and settings page
   only; never fetched. */
export const FEEDBACK_FORM_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u';

export const HOMEPAGE_URL = 'https://rjedtech.github.io/rj-tasks-for-teachers/';
