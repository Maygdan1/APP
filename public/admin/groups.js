import { API_URL, apiFetch, showAlert } from '../shared/telegram.js';

export async function loadServiceSettings() {
    const response = await apiFetch(`${API_URL}/api/admin/settings`);
    if (!response.ok) return;
    const { settings } = await response.json();
    document.getElementById('acceptGroupRequests').checked = settings.acceptGroupRequests;
    document.getElementById('acceptNewUsers').checked = settings.acceptNewUsers;
    document.getElementById('maxPendingGroupRequests').value = settings.maxPendingGroupRequests;
}

export async function saveServiceSettings() {
    const response = await apiFetch(`${API_URL}/api/admin/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            acceptGroupRequests: document.getElementById('acceptGroupRequests').checked,
            acceptNewUsers: document.getElementById('acceptNewUsers').checked,
            maxPendingGroupRequests: Number(document.getElementById('maxPendingGroupRequests').value)
        })
    });
    const data = await response.json();
    showAlert(response.ok ? 'Настройки сохранены' : data.error || 'Не удалось сохранить настройки');
}

export async function deleteManagedGroup(groupId) {
    const response = await apiFetch(`${API_URL}/api/admin/groups/${groupId}`, { method: 'DELETE' });
    const data = await response.json();
    showAlert(response.ok ? 'Запрос удален' : data.error || 'Не удалось удалить запрос');
    if (response.ok) loadManagedGroups();
}

    export async function generateGroupInvite(groupId) {
        const response = await apiFetch(`${API_URL}/api/admin/groups/${groupId}/invite`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) return showAlert(data.error || 'Не удалось создать приглашение');
        const field = document.querySelector(`[data-group-invite="${groupId}"]`);
        field.value = data.message;
        field.select();
        showAlert('Приглашение создано. Скопируйте его и передайте ответственному.');
    }

export async function loadManagedGroups() {
    const response = await apiFetch(`${API_URL}/api/admin/groups`);
    if (!response.ok) return;
    const { groups } = await response.json();
    const container = document.getElementById('managedGroups');
    container.innerHTML = groups.map(group => `
        <details class="managed-group">
            <summary>${group.name} (${group.active ? 'активна' : 'обнаружена'})</summary>
            <div class="managed-group-body">
            <input data-group-name="${group._id}" value="${group.name}" placeholder="Название">
            <input data-group-topic="${group._id}" type="number" value="${group.topicId ?? ''}" placeholder="Topic ID">
            <label><input data-group-active="${group._id}" type="checkbox" ${group.active ? 'checked' : ''}> Использовать для рассылки</label>
            <label><input data-group-blocked="${group._id}" type="checkbox" ${group.blocked ? 'checked' : ''}> Заблокировать заявки</label>
            <button class="btn-save" data-save-group="${group._id}">Сохранить</button>
            <button class="btn-save" data-invite-group="${group._id}">Сгенерировать приглашение</button>
            <input data-group-invite="${group._id}" readonly placeholder="Сообщение появится здесь">
            <button class="btn-save" data-check-group="${group._id}">Проверить бота</button>
            <button class="btn-save" data-delete-group="${group._id}" style="background-color: var(--danger-color);">Удалить</button>
            </div>
        </details>`).join('');
}

export async function saveManagedGroup(groupId) {
    const response = await apiFetch(`${API_URL}/api/admin/groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: document.querySelector(`[data-group-name="${groupId}"]`).value.trim(),
            topicId: document.querySelector(`[data-group-topic="${groupId}"]`).value,
            active: document.querySelector(`[data-group-active="${groupId}"]`).checked,
            blocked: document.querySelector(`[data-group-blocked="${groupId}"]`).checked
        })
    });
    const data = await response.json();
    showAlert(response.ok ? 'Группа обновлена' : data.error || 'Не удалось обновить группу');
    if (response.ok) loadManagedGroups();
}

export async function checkManagedGroup(groupId) {
    const response = await apiFetch(`${API_URL}/api/admin/groups/${groupId}/check`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return showAlert(data.error || 'Проверка не выполнена');
    showAlert(`Статус бота: ${data.botStatus}. Отправка: ${data.canPost ? 'доступна' : 'недоступна'}`);
}

export async function createBackup() {
    const response = await apiFetch(`${API_URL}/api/admin/backup/download`);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return showAlert(data.error || 'Бэкап не создан');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const result = document.getElementById('backupResult');
    if (result.dataset.url) URL.revokeObjectURL(result.dataset.url);
    const filename = `birthday-users-${new Date().toISOString().slice(0, 10)}.json`;
    result.dataset.url = url;
    result.innerHTML = `<div class="file-card"><span class="file-icon">🗄️</span><span class="file-meta"><b>${filename}</b><small>${Math.ceil(blob.size / 1024)} КБ · JSON</small></span><button class="file-download" type="button">⬇️</button></div>`;
    result.querySelector('.file-download').addEventListener('click', () => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
    });
    showAlert('Файл готов к скачиванию');
}