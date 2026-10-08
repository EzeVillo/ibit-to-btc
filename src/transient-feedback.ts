const FEEDBACK_DURATION_MS = 5_000;

export function createTransientFeedback(element: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function hide() {
    clearTimeout(timer);
    timer = undefined;
    element.hidden = true;
    element.textContent = '';
  }

  function show(message: string) {
    hide();
    element.textContent = message;
    element.hidden = false;
    timer = setTimeout(hide, FEEDBACK_DURATION_MS);
  }

  return { show, hide };
}
