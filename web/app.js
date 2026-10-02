const element = id => document.getElementById(id);
let accessToken = '';
let scenarios = [];
const errors = {
  UNAUTHORIZED: 'Nieprawidłowe hasło dostępu.', DAILY_LIMIT: 'Wykorzystano dzisiejszy limit wywołań.',
  REQUEST_IN_PROGRESS: 'Inne wywołanie jest w toku. Spróbuj po jego zakończeniu.',
  PROVIDER_UNAVAILABLE: 'Ten dostawca nie jest skonfigurowany.', API_TIMEOUT: 'Model nie odpowiedział w wyznaczonym czasie.',
  HTTP_ERROR: 'Dostawca AI odrzucił żądanie. Sprawdź konfigurację lub limit konta.',
};
async function api(path, body) {
  const response = await fetch('./api/' + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', redirect: 'error',
    headers: { Authorization: 'Bearer ' + accessToken, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(55000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(errors[data.error] || 'Nie udało się wykonać zadania. Odpowiedź nie przeszła kontroli.');
  return data;
}
function node(tag, text, className) {
  const result = document.createElement(tag);
  result.textContent = text;
  if (className) result.className = className;
  return result;
}
function showBudget(budget) {
  element('budget').textContent = `Pozostało ${budget.remaining} z ${budget.limit} wywołań na dziś (UTC).`;
}
function showSources() {
  const item = scenarios.find(item => item.id === element('case').value);
  element('sources').replaceChildren();
  for (const source of item?.sources ?? []) {
    const box = node('article', '', 'source');
    box.append(node('h3', source.id + ' · ' + source.kind), node('p', source.text));
    element('sources').append(box);
  }
}
element('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  accessToken = element('password').value;
  element('password').value = '';
  element('login-error').textContent = '';
  try {
    const config = await api('config');
    scenarios = (await api('cases')).cases;
    element('case').replaceChildren(...scenarios.map(item => {
      const option = node('option', item.id + ' · ' + item.title); option.value = item.id; return option;
    }));
    element('provider').replaceChildren(...config.providers.map(item => {
      const option = node('option', item.provider + ' · ' + item.model); option.value = item.provider; return option;
    }));
    element('run').disabled = !config.providers.length;
    showBudget(config.budget); showSources();
    element('login').hidden = true; element('workspace').hidden = false;
  } catch (error) { accessToken = ''; element('login-error').textContent = error.message; }
});
element('logout').addEventListener('click', () => {
  accessToken = ''; scenarios = [];
  element('workspace').hidden = true; element('login').hidden = false;
  element('facts').replaceChildren(); element('sources').replaceChildren();
});
element('case').addEventListener('change', showSources);
function factValue(fact) {
  if (fact.type === 'unknown') return 'Brak potwierdzonej informacji';
  if (fact.type === 'money') {
    const formatted = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: fact.currency }).format(fact.minor_units / 100);
    return (fact.precision === 'approximate' ? 'Około ' : '') + formatted + (fact.as_of ? ` · stan ${fact.as_of}` : ' · bez daty salda');
  }
  if (fact.type === 'boolean') return fact.boolean_value ? 'Tak' : 'Nie';
  return fact.text_value;
}
element('run').addEventListener('click', async () => {
  for (const id of ['run', 'case', 'provider', 'logout']) element(id).disabled = true;
  element('status').textContent = 'Model odczytuje tekst. Potem sprawdzimy format, wartości i cytaty…';
  for (const id of ['facts', 'arithmetic', 'questions', 'metadata']) element(id).replaceChildren();
  try {
    const data = await api('extract', { provider: element('provider').value, case_id: element('case').value });
    const count = data.checks.filter(check => check.correct).length;
    element('status').textContent = `${data.case_id}: ${count}/${data.checks.length} wskazanych pól zgodnych ze wzorcem.`;
    for (const fact of data.result.output.facts) {
      const box = node('article', '', 'fact');
      const check = data.checks.find(check => check.field === fact.field);
      box.append(node('h3', fact.field), node('p', factValue(fact), 'value'),
        node('span', check?.correct ? 'Zgodne ze wzorcem' : 'Wymaga sprawdzenia', check?.correct ? 'pass' : 'mismatch'));
      if (fact.quote) box.append(node('blockquote', fact.quote), node('p', 'Źródło: ' + fact.source_id, 'small'));
      element('facts').append(box);
    }
    if (data.arithmetic) {
      const money = units => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: data.arithmetic.currency }).format(units / 100);
      element('arithmetic').append(node('h3', 'Kontrola sumy'), node('p', `Suma listy: ${money(data.arithmetic.listed_total_minor)}. Różnica względem deklaracji: ${money(data.arithmetic.difference_minor)}.`));
    }
    for (const [title, items] of [['Pytania do uzupełnienia', data.result.output.questions], ['Ostrzeżenia', data.result.output.warnings]]) {
      if (items.length) { element('questions').append(node('h3', title)); for (const text of items) element('questions').append(node('p', text)); }
    }
    element('metadata').textContent = `${data.result.model} · ${data.result.elapsed_ms} ms · ${data.result.prompt_version}`;
    showBudget(data.budget);
  } catch (error) { element('status').textContent = error.message; }
  finally {
    for (const id of ['run', 'case', 'provider', 'logout']) element(id).disabled = false;
    try { showBudget((await api('config')).budget); } catch { }
  }
});
