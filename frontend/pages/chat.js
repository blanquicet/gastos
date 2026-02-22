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
        <span class="chat-header-title">Conti AI</span>
        <span class="chat-header-dot" id="chat-status-dot"></span>
      </header>

      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome" id="chat-welcome">
          <span class="chat-welcome-label">Conti AI</span>
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
          <div id="chat-voice-overlay" class="chat-voice-overlay" style="display:none">
            <canvas id="chat-volume-canvas" class="chat-volume-canvas"></canvas>
            <span id="chat-voice-label" class="chat-voice-label">🎙️ 0s</span>
          </div>
          <button type="submit" id="chat-send-btn" aria-label="Enviar" style="display:none">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
          <button type="button" id="chat-mic-btn" class="chat-mic-btn" aria-label="Grabar voz" title="Hablar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
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

  // Conversation history for multi-turn context
  const conversationHistory = [];

  // --- Voice Recording ---
  const micBtn = document.getElementById('chat-mic-btn');
  const sendBtn = document.getElementById('chat-send-btn');
  const voiceOverlay = document.getElementById('chat-voice-overlay');
  const voiceLabel = document.getElementById('chat-voice-label');
  const volumeCanvas = document.getElementById('chat-volume-canvas');
  let mediaRecorder = null;
  let audioChunks = [];
  let recordingTimer = null;
  let durationInterval = null;
  let recordingSeconds = 0;
  let audioContext = null;
  let analyser = null;
  let animFrameId = null;

  // Detect supported format
  const audioFormats = [
    { mime: 'audio/ogg;codecs=opus',  ext: 'ogg' },   // Best: Azure accepts directly, no ffmpeg
    { mime: 'audio/webm;codecs=opus', ext: 'webm' },  // Good: fast remux to OGG (~50ms)
    { mime: 'audio/webm',             ext: 'webm' },
    { mime: 'audio/mp4',              ext: 'mp4' },    // Safari: full transcode to WAV (~2-3s)
  ];

  const supportedFormat = typeof MediaRecorder !== 'undefined'
    ? audioFormats.find(f => MediaRecorder.isTypeSupported(f.mime))
    : null;

  if (!supportedFormat) {
    micBtn.title = 'Tu navegador no soporta grabación. Usa el dictado del teclado.';
    micBtn.style.opacity = '0.3';
    micBtn.disabled = true;
  }

  function showVoiceOverlay(text, showCanvas = true) {
    input.style.display = 'none';
    voiceOverlay.style.display = 'flex';
    voiceLabel.textContent = text;
    volumeCanvas.style.display = showCanvas ? '' : 'none';
    if (!showCanvas) {
      voiceLabel.style.flex = '1';
      voiceLabel.style.textAlign = 'center';
    } else {
      voiceLabel.style.flex = '';
      voiceLabel.style.textAlign = '';
    }
    sendBtn.disabled = true;
  }

  function hideVoiceOverlay() {
    voiceOverlay.style.display = 'none';
    input.style.display = '';
    sendBtn.disabled = false;
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
  }

  function drawVolume() {
    if (!analyser || !volumeCanvas) return;
    const ctx = volumeCanvas.getContext('2d');
    const w = volumeCanvas.width = volumeCanvas.offsetWidth * 2;
    const h = volumeCanvas.height = volumeCanvas.offsetHeight * 2;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, w, h);
    const bars = 24;
    const barW = w / bars - 2;
    const step = Math.floor(data.length / bars);

    for (let i = 0; i < bars; i++) {
      const val = data[i * step] / 255;
      const barH = Math.max(2, val * h * 0.9);
      ctx.fillStyle = `rgba(16, 185, 129, ${0.4 + val * 0.6})`;
      ctx.fillRect(i * (barW + 2), (h - barH) / 2, barW, barH);
    }

    animFrameId = requestAnimationFrame(drawVolume);
  }

  micBtn.addEventListener('click', async () => {
    if (!supportedFormat) return;

    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      recordingSeconds = 0;

      // Setup volume analyser
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      mediaRecorder = new MediaRecorder(stream, { mimeType: supportedFormat.mime });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        clearTimeout(recordingTimer);
        clearInterval(durationInterval);
        if (audioContext) { audioContext.close(); audioContext = null; }
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        micBtn.classList.remove('recording');

        const blob = new Blob(audioChunks, { type: supportedFormat.mime });
        audioChunks = [];

        if (blob.size > 10 * 1024 * 1024) {
          showVoiceOverlay('Audio muy largo. Intenta de nuevo.');
          setTimeout(hideVoiceOverlay, 3000);
          return;
        }

        // Transcribing state
        showVoiceOverlay('Transcribiendo...', false);
        micBtn.disabled = true;

        try {
          const formData = new FormData();
          formData.append('audio', blob, `audio.${supportedFormat.ext}`);

          const resp = await fetch(`${API_URL}/stt`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: { 'X-Requested-With': 'conti' },
          });

          const data = await resp.json();

          hideVoiceOverlay();

          if (resp.ok && data.text) {
            input.value = data.text;
            form.dispatchEvent(new Event('submit', { cancelable: true }));
          } else if (resp.ok && !data.text) {
            input.placeholder = 'No pude entenderte. Intenta de nuevo.';
            setTimeout(() => { input.placeholder = 'Escribe tu pregunta...'; }, 3000);
          } else {
            input.placeholder = data.error || 'Error al transcribir';
            setTimeout(() => { input.placeholder = 'Escribe tu pregunta...'; }, 3000);
          }
        } catch (err) {
          hideVoiceOverlay();
          input.placeholder = 'Error de conexión';
          setTimeout(() => { input.placeholder = 'Escribe tu pregunta...'; }, 3000);
        } finally {
          micBtn.disabled = false;
        }
      };

      mediaRecorder.start();
      micBtn.classList.add('recording');
      showVoiceOverlay('🎙️ 0s');
      drawVolume();

      durationInterval = setInterval(() => {
        recordingSeconds++;
        voiceLabel.textContent = `🎙️ ${recordingSeconds}s`;
      }, 1000);

      // Auto-stop at 60 seconds
      recordingTimer = setTimeout(() => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 60000);

    } catch (err) {
      hideVoiceOverlay();
      if (err.name === 'NotAllowedError') {
        input.placeholder = 'Permiso de micrófono denegado';
      } else {
        input.placeholder = 'No se pudo acceder al micrófono';
      }
      setTimeout(() => { input.placeholder = 'Escribe tu pregunta...'; }, 3000);
    }
  });

  backBtn.addEventListener('click', () => {
    window.history.back();
  });

  // Toggle send/mic buttons based on input content
  function updateInputButtons() {
    const hasText = input.value.trim().length > 0;
    sendBtn.style.display = hasText ? '' : 'none';
    micBtn.style.display = hasText ? 'none' : '';
  }
  input.addEventListener('input', updateInputButtons);

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
    conversationHistory.push({ role: 'user', content: message });
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
        body: JSON.stringify({ message, history: conversationHistory }),
      });

      removeMessage(loadingId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        appendMessage('assistant', `No pude procesar tu pregunta. ${err.error || 'Intenta de nuevo.'}`);
        return;
      }

      const data = await response.json();
      appendMessage('assistant', data.message);
      conversationHistory.push({ role: 'assistant', content: data.message });

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
      updateInputButtons();
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
