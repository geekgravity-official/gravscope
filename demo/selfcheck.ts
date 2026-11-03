import type { GravScope } from '../src/index';

export async function runSelfCheck(gc: GravScope): Promise<void> {
  const report: string[] = [];
  const check = (name: string, pass: boolean) => {
    report.push(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  };

  try {
    console.log('autotest-log', { n: 1 });
    console.error('autotest-error');
    console.log('%cstyled', 'color:#f0a202;font-weight:bold', 'autotest-styled');
    console.table([{ id: 1, name: 'gc-table-name' }]);
    const response = await fetch('/mock.json');
    check('fetch', response.ok);
    await new Promise((resolve) => setTimeout(resolve, 30));
    gc.show();
    const root = document.querySelector('gravscope-root');
    const shadow = root?.shadowRoot;
    const text = () => shadow?.textContent ?? '';
    check('host', Boolean(shadow));
    check('log', text().includes('autotest-log'));
    check('error', text().includes('autotest-error'));
    check('styled', text().includes('autotest-styled'));
    check('table', text().includes('gc-table-name'));
    check('network', text().includes('mock.json'));

    gc.showTab('storage');
    const local = [...(shadow?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'LocalStorage');
    local?.click();
    check('storage', text().includes('gravscope-demo'));

    gc.showTab('element');
    check('element', text().includes('autotest-anchor'));
    gc.showTab('system');
    check('system', /Mozilla/i.test(text()));

    gc.showTab('log');
    const input = shadow?.querySelector('.gc-cmd-input') as HTMLInputElement | null;
    if (input?.form) {
      input.value = '40 + 2';
      input.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      check('command', text().includes('42'));
    } else {
      check('command', false);
    }
  } catch (error) {
    report.push(`FAIL exception ${error instanceof Error ? error.message : String(error)}`);
  }

  const box = document.getElementById('autotest');
  if (box) {
    box.hidden = false;
    box.textContent = report.join('\n');
  }
  const pass = report.length > 0 && report.every((line) => line.startsWith('PASS'));
  document.title = pass ? 'AUTOTEST_OK' : 'AUTOTEST_FAIL';
}
