import { loadManagedGroups, saveManagedGroup, loadServiceSettings, saveServiceSettings, deleteManagedGroup, checkManagedGroup, generateGroupInvite, copyGroupInvite, createBackup } from './groups.js';
import { showAlert } from '../shared/telegram.js';
import { state } from './state.js';
import { loadUsers, filterUsers, filterUsersByGroup, handleGroupSelect, handleRoleChange, saveUserData, deleteUser } from './users.js';
import { renderCalendar } from './calendar.js';
import { setupExportSelect, exportGroupData } from './export.js';
import { escapeHtml } from '../shared/utils.js';

let pendingConfirmation = null;
let pendingRoleUserId = null;
let choiceTarget = null;

export function requestDeleteConfirmation(action) {
    pendingConfirmation = action;
    document.getElementById('confirmModal').hidden = false;
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.toggle('active-content', tab.id === tabId));
    if (tabId === 'calendarTab') renderCalendar();
}

function openChoiceModal(selectId, title) {
    const select = document.getElementById(selectId);
    choiceTarget = select;
    document.getElementById('choiceModalTitle').textContent = title;
    document.getElementById('choiceOptions').innerHTML = [...select.options].map(option => `
        <button class="choice-option ${option.selected ? 'selected' : ''}" type="button" data-choice-value="${option.value}">${escapeHtml(option.textContent)}</button>`).join('');
    document.getElementById('choiceModal').hidden = false;
}

function updateFilterTrigger(triggerId, selectId) {
    const trigger = document.getElementById(triggerId);
    const select = document.getElementById(selectId);
    if (trigger && select) trigger.textContent = select.options[select.selectedIndex]?.textContent || '';
}

document.querySelectorAll('.tab-btn').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
document.getElementById('calendarPeriod').addEventListener('change', renderCalendar);
document.getElementById('calendarPeriodTrigger').addEventListener('click', () => openChoiceModal('calendarPeriod', 'Период отображения'));
document.getElementById('calendarGroups').addEventListener('change', event => {
    state.selectedCalendarGroups = [event.target.value].filter(Boolean);
    updateFilterTrigger('calendarGroupsTrigger', 'calendarGroups');
    renderCalendar();
});
document.getElementById('calendarGroupsTrigger').addEventListener('click', () => openChoiceModal('calendarGroups', 'Отображать'));
document.getElementById('exportGroupTrigger').addEventListener('click', () => openChoiceModal('exportGroupSelect', 'Группа для выгрузки'));
document.getElementById('searchInput').addEventListener('input', event => filterUsers(event.target.value));
document.getElementById('usersGroupFilter').addEventListener('change', event => filterUsersByGroup(event.target.value));
document.getElementById('usersGroupTrigger').addEventListener('click', () => openChoiceModal('usersGroupFilter', 'Группа'));
document.getElementById('exportButton').addEventListener('click', exportGroupData);
document.getElementById('saveServiceSettings').addEventListener('click', saveServiceSettings);
document.getElementById('createBackup').addEventListener('click', createBackup);
document.getElementById('managedGroups').addEventListener('click', event => {
    const button = event.target.closest('[data-save-group]');
    if (button) saveManagedGroup(button.dataset.saveGroup);
    const deleteButton = event.target.closest('[data-delete-group]');
    if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        requestDeleteConfirmation(() => deleteManagedGroup(deleteButton.dataset.deleteGroup));
    }
    const checkButton = event.target.closest('[data-check-group]');
    if (checkButton) checkManagedGroup(checkButton.dataset.checkGroup);
    const inviteButton = event.target.closest('[data-invite-group]');
    if (inviteButton) generateGroupInvite(inviteButton.dataset.inviteGroup);
    const copyButton = event.target.closest('[data-copy-group]');
    if (copyButton) copyGroupInvite(copyButton.dataset.copyGroup);
});

document.getElementById('userList').addEventListener('change', event => {
    const userId = event.target.dataset.userid || event.target.id.replace('role-', '');
    if (event.target.matches('input[type="checkbox"]')) handleGroupSelect(event.target, userId);
    if (event.target.matches('select')) handleRoleChange(userId);
});

document.getElementById('userList').addEventListener('click', event => {
    const roleButton = event.target.closest('[data-action="pick-role"]');
    if (roleButton) {
        const roleSelect = document.getElementById(`role-${roleButton.dataset.userId}`);
        pendingRoleUserId = roleButton.dataset.userId;
        document.querySelectorAll('#roleOptions input').forEach(input => { input.checked = input.value === roleSelect.value; });
        document.getElementById('roleModal').hidden = false;
        return;
    }
    const button = event.target.closest('[data-action="save-user"]');
    if (button) saveUserData(button.dataset.userId);
    const deleteButton = event.target.closest('[data-action="delete-user"]');
    if (deleteButton) requestDeleteConfirmation(() => deleteUser(deleteButton.dataset.userId));
});

document.getElementById('roleSave').addEventListener('click', async () => {
    const selected = document.querySelector('#roleOptions input:checked');
    if (!selected || !pendingRoleUserId) return;
    const userId = pendingRoleUserId;
    document.getElementById(`role-${userId}`).value = selected.value;
    document.getElementById('roleModal').hidden = true;
    pendingRoleUserId = null;
    await saveUserData(userId);
});

document.getElementById('roleCancel').addEventListener('click', () => {
    pendingRoleUserId = null;
    document.getElementById('roleModal').hidden = true;
});

document.getElementById('roleOptions').innerHTML = `
    <label><input type="radio" name="role-choice" value="child"> 🎓 студент</label>
    <label><input type="radio" name="role-choice" value="mentor"> 👑 наставник</label>
    <label><input type="radio" name="role-choice" value="admin"> 🛡️ админ</label>`;

document.getElementById('choiceOptions').addEventListener('click', event => {
    const option = event.target.closest('[data-choice-value]');
    if (!option || !choiceTarget) return;
    choiceTarget.value = option.dataset.choiceValue;
    choiceTarget.dispatchEvent(new Event('change', { bubbles: true }));
    if (choiceTarget.id === 'exportGroupSelect') updateFilterTrigger('exportGroupTrigger', 'exportGroupSelect');
    if (choiceTarget.id === 'calendarPeriod') updateFilterTrigger('calendarPeriodTrigger', 'calendarPeriod');
    if (choiceTarget.id === 'usersGroupFilter') updateFilterTrigger('usersGroupTrigger', 'usersGroupFilter');
    choiceTarget = null;
    document.getElementById('choiceModal').hidden = true;
});

document.querySelectorAll('.confirm-modal').forEach(modal => {
    modal.addEventListener('click', event => {
        if (event.target !== modal) return;
        modal.hidden = true;
        if (modal.id === 'roleModal') pendingRoleUserId = null;
        if (modal.id === 'choiceModal') choiceTarget = null;
        if (modal.id === 'confirmModal') pendingConfirmation = null;
    });
});

document.getElementById('confirmYes').addEventListener('click', async () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    document.getElementById('confirmModal').hidden = true;
    if (action) await action();
});

document.getElementById('confirmNo').addEventListener('click', () => {
    pendingConfirmation = null;
    document.getElementById('confirmModal').hidden = true;
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
                    calendarGroups.innerHTML = '<option value="">Все доступные группы</option>' + ownOption + availableGroups.map(group => `<option value="${group._id}">${escapeHtml(group.name)}</option>`).join('');
        const profileButton = document.querySelector('[data-tab="profileTab"]');
        const usersButton = document.querySelector('[data-tab="usersTab"]');
        const actionsButton = document.querySelector('[data-tab="actionsTab"]');
        const backupBlock = document.getElementById('backupBlock');
        if (state.role === 'mentor') {
            actionsButton.style.display = 'none';
            switchTab('usersTab');
        } else {
            actionsButton.style.display = '';
            backupBlock.style.display = 'block';
            switchTab('usersTab');
        }
    }
}).catch(error => {
    document.getElementById('loader').innerText = `Ошибка загрузки: ${error.message}`;
    showAlert(error.message);
});
