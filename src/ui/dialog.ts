// In-page dialogs. Native alert/confirm/prompt are blocked in some embeds (e.g. sandboxed viewers).

function open(build: (box: HTMLElement, close: () => void) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop dialog';
  const box = document.createElement('div');
  box.className = 'modal dialog-box';
  overlay.append(box);
  const close = () => overlay.remove();
  build(box, close);
  document.body.append(overlay);
  (box.querySelector('textarea, .btn.primary') as HTMLElement | null)?.focus();
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function message(box: HTMLElement, text: string): void {
  const p = document.createElement('p');
  p.className = 'dialog-text';
  p.textContent = text;
  box.append(p);
}

export function showMessage(text: string): Promise<void> {
  return new Promise((resolve) =>
    open((box, close) => {
      message(box, text);
      const row = document.createElement('div');
      row.className = 'prompt-buttons';
      row.append(button('확인', 'btn primary', () => (close(), resolve())));
      box.append(row);
    }),
  );
}

export function askConfirm(text: string, okLabel = '확인'): Promise<boolean> {
  return new Promise((resolve) =>
    open((box, close) => {
      message(box, text);
      const row = document.createElement('div');
      row.className = 'prompt-buttons';
      row.append(
        button(okLabel, 'btn primary', () => (close(), resolve(true))),
        button('취소', 'btn ghost', () => (close(), resolve(false))),
      );
      box.append(row);
    }),
  );
}

/** Text dialog. With `initial` it shows copyable text; returns the entered text or null when cancelled. */
export function askText(text: string, initial = '', okLabel = '확인'): Promise<string | null> {
  return new Promise((resolve) =>
    open((box, close) => {
      message(box, text);
      const area = document.createElement('textarea');
      area.className = 'dialog-input';
      area.id = 'dialog-input';
      area.rows = 4;
      area.value = initial;
      box.append(area);
      if (initial) requestAnimationFrame(() => area.select());
      const row = document.createElement('div');
      row.className = 'prompt-buttons';
      row.append(
        button(okLabel, 'btn primary', () => (close(), resolve(area.value))),
        button('취소', 'btn ghost', () => (close(), resolve(null))),
      );
      box.append(row);
    }),
  );
}
