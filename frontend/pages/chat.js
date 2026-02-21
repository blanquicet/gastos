/**
 * Chat Page — Financial Assistant
 * 
 * Minimal chat UI that sends messages to POST /chat
 * and displays the assistant's responses.
 */

const API_URL = window.API_URL || '';

export function render() {
  return `
    <div class="chat-page">
      <header class="chat-header">
        <button class="back-btn" id="chat-back-btn">←</button>
        <h1>💬 Asistente Financiero</h1>
      </header>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-message assistant">
          <div class="chat-bubble">
            ¡Hola! Soy tu asistente financiero. Pregúntame sobre tus gastos, ingresos o presupuesto.
            <br><br>
            Ejemplos:
            <ul>
              <li>¿Cuánto gasté en mercado este mes?</li>
              <li>¿Cuál es mi top 5 de gastos?</li>
              <li>¿Cómo va mi presupuesto?</li>
              <li>Compara enero y febrero</li>
            </ul>
          </div>
        </div>
      </div>

      <form class="chat-input-area" id="chat-form">
        <input 
          type="text" 
          id="chat-input" 
          placeholder="Escribe tu pregunta..." 
          autocomplete="off"
          autofocus
        />
        <button type="submit" id="chat-send-btn">Enviar</button>
      </form>
    </div>
  `;
}

export function setup() {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const messagesEl = document.getElementById('chat-messages');
  const backBtn = document.getElementById('chat-back-btn');

  backBtn.addEventListener('click', () => {
    window.history.back();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    appendMessage('user', message);
    input.value = '';
    input.disabled = true;

    // Show loading
    const loadingId = appendMessage('assistant', '⏳ Pensando...');

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
      });

      // Remove loading
      removeMessage(loadingId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        appendMessage('assistant', `❌ ${err.error || 'Error al procesar tu pregunta'}`);
        return;
      }

      const data = await response.json();
      appendMessage('assistant', data.message);
    } catch (err) {
      removeMessage(loadingId);
      appendMessage('assistant', '❌ No se pudo conectar con el servidor');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  function appendMessage(role, content) {
    const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    const div = document.createElement('div');
    div.className = `chat-message ${role}`;
    div.id = id;
    div.innerHTML = `<div class="chat-bubble">${escapeHtml(content)}</div>`;
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
}
