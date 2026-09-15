import { API_URL, apiFetch, downloadFile, showAlert } from '../shared/telegram.js';

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
        document.querySelector(`[data-copy-group="${groupId}"]`).disabled = false;
        showAlert('Приглашение создано. Скопируйте его и передайте ответственному.');
    }

    export async function copyGroupInvite(groupId) {
        const field = document.querySelector(`[data-group-invite="${groupId}"]`);
        if (!field?.value) return showAlert('Сначала сгенерируйте приглашение');
        try {
            await navigator.clipboard.writeText(field.value);
        } catch {
            field.focus();
            field.select();
            document.execCommand('copy');
        }
        showAlert('Приглашение скопировано');
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
            <button class="icon-action icon-save" title="Сохранить" aria-label="Сохранить" data-save-group="${group._id}">☁</button>
            <button class="btn-save" data-invite-group="${group._id}">Сгенерировать приглашение</button>
            <div class="invite-copy-row">
                <input data-group-invite="${group._id}" readonly placeholder="Сообщение появится здесь">
                <button class="copy-invite" type="button" data-copy-group="${group._id}" disabled title="Скопировать приглашение" aria-label="Скопировать приглашение">📋</button>
            </div>
            <button class="icon-action icon-trash" title="Удалить группу" aria-label="Удалить группу" data-delete-group="${group._id}">🗑️</button>
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
    const result = document.getElementById('backupResult');
    const data = await response.json();
    result.innerHTML = `<div class="file-card"><span class="file-icon">🗄️</span><span class="file-meta"><b>birthday-users.json</b><small>Файл готов</small></span><button class="file-download" type="button">⬇️</button></div>`;
    result.querySelector('.file-download').addEventListener('click', () => downloadFile(new URL(data.url, API_URL).href, 'birthday-users.json'));
}