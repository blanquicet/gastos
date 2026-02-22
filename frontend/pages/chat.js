/**
 * Chat Page — Financial Assistant
 * 
 * Premium chat UI inspired by editorial/Squarespace aesthetics.
 * Clean typography, ample whitespace, subtle animations.
 */

import { API_URL } from '../config.js';

export function render() {
  return `
    <div class="chat-page">
      <header class="chat-header">
        <button class="back-btn" id="chat-back-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        </button>
        <span class="chat-header-title">Asistente</span>
        <span class="chat-header-dot" id="chat-status-dot"></span>
      </header>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome" id="chat-welcome">
          <span class="chat-welcome-label">Asistente financiero</span>
          <h2>¿En qué puedo<br>ayudarte hoy?</h2>
          <p>Consulta tus gastos, ingresos y presupuesto con lenguaje natural.</p>
          <div class="chat-suggestions" id="chat-suggestions">
            <button class="chat-chip" data-msg="¿Cuánto gasté en mercado este mes?">Gastos en mercado</button>
            <button class="chat-chip" data-msg="¿Cuál es mi top 5 de gastos este mes?">Top 5 gastos</button>
            <button class="chat-chip" data-msg="¿Cómo va mi presupuesto este mes?">Estado del presupuesto</button>
            <button class="chat-chip" data-msg="Compara enero y febrero 2026">Comparar meses</button>
          </div>
        </div>
      </div>

      <div class="chat-input-wrap">
        <form class="chat-input-area" id="chat-form">
          <input 
            type="text" 
            id="chat-input" 
            placeholder="Escribe tu pregunta..." 
            autocomplete="off"
            autofocus
          />
          <button type="submit" id="chat-send-btn" aria-label="Enviar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </form>
      </div>
    </div>
  `;
}

export function setup() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const messagesEl = document.getElementById('chat-messages');
  const backBtn = document.getElementById('chat-back-btn');
  const welcome = document.getElementById('chat-welcome');
  const statusDot = document.getElementById('chat-status-dot');

  backBtn.addEventListener('click', () => {
    window.history.back();
  });

  // Suggestion chips
  document.querySelectorAll('.chat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.msg;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    if (welcome) welcome.style.display = 'none';

    appendMessage('user', message);
    input.value = '';
    input.disabled = true;
    document.getElementById('chat-send-btn').disabled = true;

    statusDot.classList.add('active');
    const loadingId = showTypingIndicator();

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });

      removeMessage(loadingId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        appendMessage('assistant', `No pude procesar tu pregunta. ${err.error || 'Intenta de nuevo.'}`);
        return;
      }

      const data = await response.json();
      appendMessage('assistant', data.message);

      // Show confirmation card if there's a movement draft
      if (data.draft && data.draft.action === 'confirm_movement') {
        appendDraftCard(data.draft);
      }
    } catch (err) {
      removeMessage(loadingId);
      appendMessage('assistant', 'No se pudo conectar con el servidor. Verifica tu conexión.');
    } finally {
      input.disabled = false;
      document.getElementById('chat-send-btn').disabled = false;
      input.focus();
      statusDot.classList.remove('active');
    }
  });

  function appendMessage(role, content) {
    const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.id = id;

    const formatted = role === 'assistant' ? formatAssistantMessage(content) : escapeHtml(content);

    if (role === 'assistant') {
      div.innerHTML = `
        <div class="chat-bubble-row">
          <div class="chat-ai-mark">AI</div>
          <div class="chat-bubble">${formatted}</div>
        </div>`;
    } else {
      div.innerHTML = `<div class="chat-bubble">${formatted}</div>`;
    }

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
  }

  function appendDraftCard(draft) {
    const id = 'draft-' + Date.now();
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    div.id = id;

    const formattedAmount = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(draft.amount);
    const dateObj = new Date(draft.date || draft.movement_date);
    const formattedDate = dateObj.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

    div.innerHTML = `
      <div class="chat-bubble-row">
        <div class="chat-ai-mark">AI</div>
        <div class="chat-draft-card">
          <div class="draft-header">🏠 Gasto del hogar</div>
          <div class="draft-row"><span class="draft-label">Descripción</span><span class="draft-value">${escapeHtml(draft.description)}</span></div>
          <div class="draft-row"><span class="draft-label">Monto</span><span class="draft-value draft-amount">${formattedAmount}</span></div>
          <div class="draft-row"><span class="draft-label">Categoría</span><span class="draft-value">${escapeHtml(draft.category_name)}</span></div>
          <div class="draft-row"><span class="draft-label">Método de pago</span><span class="draft-value">${escapeHtml(draft.payment_method_name)}</span></div>
          <div class="draft-row"><span class="draft-label">Fecha</span><span class="draft-value">${formattedDate}</span></div>
          <div class="draft-actions">
            <button class="draft-btn-confirm" data-draft='${JSON.stringify(draft)}'>✓ Registrar</button>
            <button class="draft-btn-edit" data-draft='${JSON.stringify(draft)}'>✏️ Editar</button>
          </div>
        </div>
      </div>`;

    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Confirm button
    div.querySelector('.draft-btn-confirm').addEventListener('click', async (e) => {
      const draftData = JSON.parse(e.target.dataset.draft);
      e.target.disabled = true;
      e.target.textContent = 'Registrando...';

      try {
        const resp = await fetch(`${API_URL}/chat/create-movement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(draftData),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || 'Error al registrar');
        }

        // Replace card with success message
        div.querySelector('.chat-draft-card').innerHTML = `
          <div class="draft-success">✅ Movimiento registrado exitosamente</div>`;
      } catch (err) {
        e.target.disabled = false;
        e.target.textContent = '✓ Registrar';
        appendMessage('assistant', `Error: ${err.message}`);
      }
    });

    // Edit button — navigate to form with prefill
    div.querySelector('.draft-btn-edit').addEventListener('click', (e) => {
      const draftData = JSON.parse(e.target.dataset.draft);
      sessionStorage.setItem('chat-prefill', JSON.stringify(draftData));
      window.location.href = '/registrar-movimiento?tipo=GASTO&from=chat';
    });
    }

  function showTypingIndicator() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.className = 'chat-message assistant';
    div.id = id;
    div.innerHTML = `
      <div class="chat-bubble-row">
        <div class="chat-ai-mark">AI</div>
        <div class="chat-bubble typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      </div>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return id;
  }

  function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatAssistantMessage(text) {
    let html = escapeHtml(text);

    // Markdown tables: detect lines with | separators
    const lines = html.split('\n');
    let result = [];
    let inTable = false;
    let tableRows = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isTableRow = line.startsWith('|') && line.endsWith('|') && line.includes('|');
      const isSeparator = /^\|[\s\-:|]+\|$/.test(line);

      if (isTableRow) {
        if (!inTable) { inTable = true; tableRows = []; }
        if (!isSeparator) {
          const cells = line.split('|').slice(1, -1).map(c => c.trim());
          tableRows.push(cells);
        }
      } else {
        if (inTable) {
          result.push(buildTable(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(line);
      }
    }
    if (inTable) result.push(buildTable(tableRows));

    html = result.join('\n');

    // Headers: ### text
    html = html.replace(/^### (.+)$/gm, '<strong style="font-size:15px">$1</strong>');
    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Lists: - item
    html = html.replace(/^- (.+)$/gm, '• $1');
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function buildTable(rows) {
    if (rows.length === 0) return '';
    const header = rows[0];
    const body = rows.slice(1);
    let t = '<table class="chat-table"><thead><tr>';
    header.forEach(h => { t += `<th>${h}</th>`; });
    t += '</tr></thead><tbody>';
    body.forEach(row => {
      t += '<tr>';
      row.forEach(cell => { t += `<td>${cell}</td>`; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    return t;
  }
}
