/*
  Canvas puts the same body class on two different things:
  - Act as User: an admin looking through a real teacher's account. RJ Tasks
    keeps working, so support and training can see what that teacher sees.
  - Student View: a fake student. RJ Tasks stays off.
  Only Act as User has the "Stop Acting as User" link.
*/
const CLASS = 'is-masquerading-or-student-view';
const STOP_LINK = 'a[data-method="post"][href*="/masquerade"]';

export function isActingAs(): boolean {
  return document.body.classList.contains(CLASS) && !!document.querySelector(STOP_LINK);
}

export function isStudentView(): boolean {
  return document.body.classList.contains(CLASS) && !document.querySelector(STOP_LINK);
}
