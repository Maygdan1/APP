import { loadManagedGroups, saveManagedGroup, loadServiceSettings, saveServiceSettings, deleteManagedGroup, checkManagedGroup, generateGroupInvite, createBackup } from './groups.js';
import { showAlert } from '../shared/telegram.js';
import { state } from './state.js';
import { loadUsers, filterUsers, filterUsersByGroup, handleGroupSelect, handleRoleChange, saveUserData, deleteUser } from './users.js';
import { renderCalendar } from './calendar.js';
import { setupExportSelect, exportGroupData } from './export.js';

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active-content', tab.id === tabId));
    if (tabId === 'calendarTab') renderCalendar();
}

document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.getElementById('calendarPeriod').addEventListener('change', renderCalendar);
document.getElementById('calendarGroups').addEventListener('change', event => {
    state.selectedCalendarGroups = [event.target.value].filter(Boolean);
    renderCalendar();
});
document.getElementById('searchInput').addEventListener('input', event => filterUsers(event.target.value));
document.getElementById('usersGroupFilter').addEventListener('change', event => filterUsersByGroup(event.target.value));
document.getElementById('exportButton').addEventListener('click', exportGroupData);
document.getElementById('saveServiceSettings').addEventListener('click', saveServiceSettings);
document.getElementById('createBackup').addEventListener('click', createBackup);
document.getElementById('managedGroups').addEventListener('click', event => {
    const button = event.target.closest('[data-save-group]');
    if (button) saveManagedGroup(button.dataset.saveGroup);
    const deleteButton = event.target.closest('[data-delete-group]');
    if (deleteButton) deleteManagedGroup(deleteButton.dataset.deleteGroup);
    const checkButton = event.target.closest('[data-check-group]');
    if (checkButton) checkManagedGroup(checkButton.dataset.checkGroup);
    const inviteButton = event.target.closest('[data-invite-group]');
    if (inviteButton) generateGroupInvite(inviteButton.dataset.inviteGroup);
});

document.getElementById('userList').addEventListener('change', event => {
    const userId = event.target.dataset.userid || event.target.id.replace('role-', '');
    if (event.target.matches('input[type="checkbox"]')) handleGroupSelect(event.target, userId);
    if (event.target.matches('select')) handleRoleChange(userId);
});

document.getElementById('userList').addEventListener('click', event => {
    const button = event.target.closest('[data-action="save-user"]');
    if (button) saveUserData(button.dataset.userId);
    const deleteButton = event.target.closest('[data-action="delete-user"]');
    if (deleteButton) deleteUser(deleteButton.dataset.userId);
});

loadUsers().then(loaded => {
    if (loaded) {
        setupExportSelect();
        loadManagedGroups();
        loadServiceSettings();
        const calendarGroups = document.getElementById('calendarGroups');
        const availableGroups = state.role === 'admin'
            ? state.groups
            : state.groups.filter(group => state.mentorGroups.some(id => String(id) === String(group._id)));
        const ownOption = state.role === 'admin' && state.ownGroups.length
            ? '<option value="__mine__">Мои группы</option>'
            : '';
            calendarGroups.innerHTML = '<option value="">Все доступные группы</option>' + ownOption + availableGroups.map(group => `<option value="${group._id}">${group.name}</option>`).join('');
        const profileButton = document.querySelector('[data-tab="profileTab"]');
        const usersButton = document.querySelector('[data-tab="usersTab"]');
        if (state.role === 'mentor') {
            usersButton.style.display = 'none';
            profileButton.style.display = '';
            switchTab('profileTab');
        } else {
            profileButton.style.display = 'none';
            renderAdminProfile();
        }
    }
}).catch(error => {
    document.getElementById('loader').innerText = `Ошибка загрузки: ${error.message}`;
    showAlert(error.message);
});

function renderAdminProfile() {
    const user = state.currentUser;
    if (!user) return;
    const groups = (user.group_ids || [])
        .map(item => state.groups.find(group => String(group._id) === String(item._id))?.name)
        .filter(Boolean);
    document.getElementById('profileCard').innerHTML = `
        <h3>Профиль наставника</h3>
        <p><b>Имя:</b> ${user.username || 'Не указано'}</p>
        <p><b>Роль:</b> Наставник</p>
        <p><b>Прикрепленные группы:</b> ${groups.length ? groups.join(', ') : 'Не назначены'}</p>`;
}