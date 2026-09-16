import { API_URL, apiFetch, downloadFile, showAlert } from '../shared/telegram.js';
import { escapeHtml, formatDateToRussian } from '../shared/utils.js';
import { state, MONTHS_GENITIVE } from './state.js';

export function setupExportSelect() {
    const select = document.getElementById('exportGroupSelect');
    select.innerHTML = state.role === 'admin' ? '<option value="all">Все группы (полная база)</option>' : '<option value="mentor_all">Все мои группы</option>';
    const groups = state.role === 'admin' ? state.groups : state.groups.filter(group => state.mentorGroups.some(id => String(id) === String(group._id)));
    groups.forEach(group => { select.innerHTML += `<option value="${group._id}">${escapeHtml(group.name)}</option>`; });
}

export function exportGroupData() {
    const selected = document.getElementById('exportGroupSelect').value;
    apiFetch(`${API_URL}/api/admin/export/csv`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupId: selected }) })
        .then(response => response.json().then(data => ({ response, data })))
        .then(({ response, data }) => {
            if (!response.ok) return showAlert(data.error || 'Не удалось сформировать файл');
            const result = document.getElementById('exportResult');
                result.innerHTML = `<div class="file-card"><span class="file-icon">📄</span><span class="file-meta"><b>Дни рождения.csv</b><small>CSV-файл готов</small></span><button class="file-download" type="button">⬇️</button></div>`;
            result.querySelector('.file-download').addEventListener('click', () => downloadFile(new URL(data.downloadUrl, API_URL).href, 'Дни_Рождения.csv'));
        })
        .catch(error => showAlert(`Ошибка экспорта: ${error.message}`));
}