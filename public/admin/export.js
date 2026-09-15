import { API_URL, apiFetch, showAlert } from '../shared/telegram.js';
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
    const users = selected === 'all' || selected === 'mentor_all' ? state.users : state.users.filter(user => (user.group_ids || []).some(group => String(group._id) === selected));
    if (!users.length) return showAlert('Нет данных для выгрузки в выбранной группе!');
    const group = state.groups.find(item => String(item._id) === selected);
    const rows = [['Имя', 'Telegram Username', 'Роль', 'День рождения', 'Группы']];
    users.forEach(user => {
        const groups = (user.group_ids || []).map(item => state.groups.find(groupItem => String(groupItem._id) === String(item._id))?.name).filter(Boolean).join(', ');
        rows.push([user.username || 'Без имени', user.tg_username ? `@${user.tg_username.replace('@', '')}` : '', user.role === 'mentor' ? 'Наставник' : 'Студент', formatDateToRussian(user.birthday, MONTHS_GENITIVE), groups]);
    });
    const csv = `\uFEFF${rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\n')}`;
    const result = document.getElementById('exportResult');
    if (result.dataset.url) URL.revokeObjectURL(result.dataset.url);
    const filename = `Дни_Рождения_${group?.name || 'Мои_группы'}.csv`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    result.dataset.url = url;
    result.innerHTML = `<div class="file-card"><span class="file-icon">📄</span><span class="file-meta"><b>${escapeHtml(filename)}</b><small>${Math.ceil(blob.size / 1024)} КБ · CSV</small></span><button class="file-download" type="button">⬇️</button></div>`;
    result.querySelector('.file-download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
    });
}