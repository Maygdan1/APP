import { API_URL, apiFetch, showAlert } from '../shared/telegram.js';
import { escapeHtml, formatDateToRussian } from '../shared/utils.js';
import { state } from './state.js';

export function formatShortGroupName(name) {
    if (!name || typeof name !== 'string') return '';
    const parts = name.split('-');
    return parts.length < 2 ? name : `${parts[0]}-${parts[parts.length - 1]}`;
}

export function handleGroupSelect(checkbox, userId) {
    if (state.role !== 'admin') return;
    const roleSelect = document.getElementById(`role-${userId}`);
    if (roleSelect?.value === 'child') {
        document.querySelectorAll(`input[data-userid="${userId}"]`).forEach(item => {
            if (item !== checkbox) item.checked = false;
        });
    }
}

export function handleRoleChange(userId) {
    if (state.role !== 'admin') return;
    const roleSelect = document.getElementById(`role-${userId}`);
    if (roleSelect?.value !== 'child') return;
    const checkboxes = [...document.querySelectorAll(`input[data-userid="${userId}"]`)];
    const checked = checkboxes.filter(item => item.checked);
    if (checked.length > 1) checkboxes.forEach((item, index) => { item.checked = index === 0; });
}

export async function loadUsers() {
    const response = await apiFetch(`${API_URL}/api/users`);
    document.getElementById('loader').style.display = 'none';
    if (!response.ok) {
        document.getElementById('accessDenied').style.display = 'block';
        return false;
    }
    const data = await response.json();
    if (!data.success) return false;
    state.users = data.users;
    state.role = data.role;
    state.currentUser = data.currentUser;
    state.groups = data.groups || [];
    state.mentorGroups = (data.mentorGroups || []).map(group => group._id);
    state.ownGroups = (data.currentUser?.group_ids || []).map(group => String(group._id));
        state.adminCount = state.users.filter(user => user.role === 'admin').length;
    document.getElementById('controls').style.display = 'block';
    document.getElementById('searchInput').style.display = state.role === 'mentor' ? 'none' : '';
    const groupFilter = document.getElementById('usersGroupFilter');
    const filterGroups = state.role === 'admin'
        ? state.groups
        : state.groups.filter(group => state.mentorGroups.some(id => String(id) === String(group._id)));
    groupFilter.innerHTML = '<option value="">Все доступные группы</option>' + filterGroups.map(group => `<option value="${group._id}">${escapeHtml(group.name)}</option>`).join('');
    const currentUserId = String(state.currentUser?._id || '');
    const orderedUsers = [...state.users].sort((left, right) => {
        if (String(left._id) === currentUserId) return -1;
        if (String(right._id) === currentUserId) return 1;
        return 0;
    });
    renderUsers(orderedUsers);
    return true;
}

export function renderUsers(users) {
    const container = document.getElementById('userList');
    container.innerHTML = '';
    if (users.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--hint-color); margin-top: 24px;">Пользователи не найдены</div>';
        return;
    }

    users.forEach(user => {
        const isAdmin = state.role === 'admin';
        const isMentor = user.role === 'mentor';
        const isAdminUser = user.role === 'admin';
        const userGroups = user.group_ids || [];
        const groupsHtml = isAdmin
            ? state.groups.map(group => `
                <label class="group-checkbox">
                    <input type="checkbox" data-userid="${user._id}" value="${group._id}" ${userGroups.some(item => String(item._id) === String(group._id)) ? 'checked' : ''}>
                    ${escapeHtml(group.name)}
                </label>`).join('')
            : userGroups.map(item => state.groups.find(group => String(group._id) === String(item._id))?.name)
                .filter(Boolean).map(name => `<div style="background: var(--button-color, #2481cc); color: #fff; padding: 6px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; display: inline-block; margin: 2px 4px 2px 0;">📚 ${escapeHtml(name)}</div>`).join('') || '<span style="color: var(--hint-color); font-size: 13px;">Группы не назначены</span>';

        const card = document.createElement('div');
        card.className = 'user-card';
        card.innerHTML = `
            <div class="user-header">
                <div><span class="user-name">${escapeHtml(user.username || 'Без имени')}</span><span class="user-handle">${escapeHtml(user.tg_username ? `@${user.tg_username.replace('@', '')}` : 'нет @username')}</span></div>
                <span class="role-badge ${isMentor || isAdminUser ? 'badge-mentor' : 'badge-child'}">${isAdminUser ? '🛡️ Администратор' : isMentor ? '👑 Наставник' : '🎓 Студент'}</span>
            </div>
            <div class="user-info">🎂 День рождения: <b>${formatDateToRussian(user.birthday, ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'])}</b></div>
            <div class="field-group"><label>Роль в системе:</label><div class="select-wrapper"><select id="role-${user._id}" ${isAdmin ? '' : 'disabled'}>
                <option value="child" ${user.role === 'child' ? 'selected' : ''}>Студент</option><option value="mentor" ${isMentor ? 'selected' : ''}>Наставник</option><option value="admin" ${isAdminUser ? 'selected' : ''}>Администратор</option>
            </select></div></div>
            <div class="field-group"><label>${isAdmin ? 'Привязанные группы:' : 'Ваши группы:'}</label><div class="${isAdmin ? 'groups-grid' : 'mentor-groups-container'}">${groupsHtml}</div></div>
            ${isAdmin ? `<button class="btn-save" data-action="save-user" data-user-id="${user._id}">Сохранить</button>${!(isAdminUser && (state.adminCount <= 1 || String(user._id) === String(state.currentUser?._id))) ? `<button class="btn-save btn-danger" data-action="delete-user" data-user-id="${user._id}">Удалить</button>` : ''}` : '<div class="muted">🔒 Вашу роль и группы регулирует Главный Администратор</div>'}`;
        container.appendChild(card);
    });
}

export function filterUsers(query) {
    const normalized = query.toLowerCase();
    renderUsers(state.users.filter(user => {
        const matchesText = (user.username || '').toLowerCase().includes(normalized) || (user.tg_username || '').toLowerCase().includes(normalized);
        const matchesGroup = !state.selectedUsersGroup || (user.group_ids || []).some(group => String(group._id) === state.selectedUsersGroup);
        return matchesText && matchesGroup;
    }));
}

export function filterUsersByGroup(groupId) {
    state.selectedUsersGroup = groupId;
    filterUsers(document.getElementById('searchInput').value);
}

export function renderMentorGroups(groupId = '') {
    const groups = state.groups.filter(group => state.mentorGroups.some(id => String(id) === String(group._id)));
    const filter = document.getElementById('mentorGroupsFilter');
    filter.innerHTML = '<option value="">Все мои группы</option>' + groups.map(group => `<option value="${group._id}">${escapeHtml(group.name)}</option>`).join('');
    filter.value = groupId;
    const visible = groupId ? groups.filter(group => String(group._id) === groupId) : groups;
    document.getElementById('mentorGroupsList').innerHTML = visible.map(group => `
        <div class="user-card">
            <div class="user-name">📚 ${escapeHtml(group.name)}</div>
            <div class="user-info">Chat ID: <b>${group.chatId}</b><br>Topic ID: <b>${group.topicId ?? 'общий чат'}</b></div>
        </div>`).join('') || '<div class="muted">Группы не назначены</div>';
}

export async function deleteUser(userId) {
    if (!confirm('Удалить пользователя из базы данных? Это действие нельзя отменить.')) return;
    const response = await apiFetch(`${API_URL}/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await response.json();
    showAlert(response.ok ? 'Пользователь удален' : data.error || 'Не удалось удалить пользователя');
    if (response.ok) await loadUsers();
}

export async function saveUserData(userId) {
    const role = document.getElementById(`role-${userId}`).value;
    const groupIds = [...document.querySelectorAll(`input[data-userid="${userId}"]:checked`)].map(item => item.value);
    if (!groupIds.length) return showAlert('Выберите хотя бы одну группу!');
    const response = await apiFetch(`${API_URL}/api/admin/update-user-role`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: userId, role, group_ids: groupIds })
    });
    const data = await response.json();
    showAlert(response.ok ? 'Изменения сохранены!' : data.error || 'Не удалось сохранить');
    if (response.ok) await loadUsers();
}