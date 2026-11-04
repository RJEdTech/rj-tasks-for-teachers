export const PRODUCT_NAME = 'RJ Tasks for Teachers';

/* The only Canvas site this extension works on. The manifest limits the
   content script to it too; canvasApi.ts checks again before every request. */
export const ALLOWED_ORIGINS = ['https://rjhs.instructure.com'];

/* "RJ Tasks Review (Microsoft Edge certification)": a sandbox course with
   made-up assignments in the Default Term. Shown even though it isn't a
   semester class, so Microsoft's reviewers can test each update. Only its
   review teacher is enrolled. */
export const REVIEW_COURSE_IDS = ['17272'];

/* "Regis Jesuit Professional Development" in RJ Canvas: where teachers go
   with questions. Same site, so these are ordinary Canvas links. */
export const PD_COURSE_PATH = '/courses/5414';
export const PD_URL = 'https://rjhs.instructure.com/courses/5414';
/* How-to pages in that course, linked from matching Check-up items. */
export const PD_HELP: Record<string, string> = {
  missing_policy: '/courses/5414/pages/setting-up-our-automatic-missing-slash-late-policy-in-canvas',
};

/* Bug reports and feature requests: the RJ Tasks for Teachers Microsoft Form
   (RJ sign-in required). Opened in a new tab from the popup and settings page
   only; never fetched. */
export const FEEDBACK_FORM_URL =
  'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=4SwuQZc-CEClZjjFdYLisQzihhIB-7hPp9L3AOSeJONUMFQ0SlRPSTgwQkJCWDM4SkEzNzFPRFZDUi4u';

export const HOMEPAGE_URL = 'https://rjedtech.github.io/rj-tasks-for-teachers/';
