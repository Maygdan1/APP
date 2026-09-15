import { API_URL, apiFetch, showAlert, tg } from './shared/telegram.js';
import { escapeHtml } from './shared/utils.js';
import { state } from './admin/state.js';
import { renderCalendar } from './admin/calendar.js';

const user = tg.initDataUnsafe?.user;
const birthdayInput = document.getElementById('birthdayInput');
const nameInput = document.getElementById('nameInput');

function updateMainButton(tabId) {
    if (tabId === 'formTab') {
        tg.MainButton.setText('Сохранить');
        tg.MainButton.show();
    } else {
        tg.MainButton.hide();
    }
}

nameInput.addEventListener('input', event => {
    event.target.value = event.target.value
        .replace(/[^А-Яа-яЁё]/g, '')
        .slice(0, 15);
    if (event.target.value) {
        event.target.value = event.target.value.charAt(0).toLocaleUpperCase('ru-RU') + event.target.value.slice(1).toLocaleLowerCase('ru-RU');
    }
});

document.querySelectorAll('.student-tabs .tab-btn').forEach(button => button.addEventListener('click', async () => {
    document.querySelectorAll('.student-tabs .tab-btn').forEach(item => item.classList.toggle('active', item === button));
    document.querySelectorAll('body > .tab-content').forEach(tab => tab.classList.toggle('active-content', tab.id === button.dataset.tab));
    updateMainButton(button.dataset.tab);
    if (button.dataset.tab === 'calendarTab') await loadStudentCalendar();
}));

async function loadStudentCalendar() {
    const response = await apiFetch(`${API_URL}/api/calendar`);
    if (!response.ok) return showAlert('Сначала заполните форму и сохраните данные.');
    const data = await response.json();
    state.users = data.users;
    state.groups = data.groups;
    state.selectedCalendarGroups = [];
    renderCalendar();
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function closeTelegramApp() {
    tg.close();
}

window.closeModal = closeModal;
window.closeTelegramApp = closeTelegramApp;

document.getElementById('supportLink')?.addEventListener('click', event => {
    event.preventDefault();
    tg.openTelegramLink('https://t.me/maygdan');
});

async function loadUserData() {
    if (!user) return;
    document.getElementById('greeting').innerText = `Привет, ${user.username || user.first_name || ''}!`;
    if (user.photo_url) document.getElementById('userAvatar').src = user.photo_url;

    try {
        const response = await apiFetch(`${API_URL}/api/user/me`);
        if (!response.ok) {
            document.querySelector('[data-tab="calendarTab"]')?.remove();
            return;
        }
        const { user: savedUser } = await response.json();
        if (!savedUser) return;

        if (savedUser.role === 'mentor' || savedUser.role === 'admin') {
            document.getElementById('welcomeModal').style.display = 'none';
            const modal = document.getElementById('adminChoiceModal');
            modal.querySelector('h3').innerText = savedUser.role === 'admin' ? 'Привет, Админ! 👑' : 'Привет, Наставник! 👑';
            modal.style.display = 'flex';
        }
        if (savedUser.username) document.getElementById('nameInput').value = savedUser.username;
        if (savedUser.group_ids?.length) document.getElementById('groupSelect').value = savedUser.group_ids[0]._id;
        if (savedUser.birthday) {
            const [year, month, day] = savedUser.birthday.split('-');
            birthdayInput.value = `${day}.${month}.${year}`;
        }
    } catch (error) {
        console.log('Пользователь заходит впервые или ошибка сети:', error);
    }
}

async function loadGroups() {
    const response = await apiFetch(`${API_URL}/api/groups`);
    if (!response.ok) throw new Error('Не удалось загрузить группы');
    const { groups } = await response.json();
    document.getElementById('groupSelect').innerHTML = groups
        .map(group => `<option value="${group._id}">${escapeHtml(group.name)}</option>`).join('');
}

birthdayInput.addEventListener('input', event => {
    const value = event.target.value.replace(/\D/g, '');
    event.target.value = value.length > 4
        ? `${value.slice(0, 2)}.${value.slice(2, 4)}.${value.slice(4, 8)}`
        : value.length > 2 ? `${value.slice(0, 2)}.${value.slice(2, 4)}` : value;
});

birthdayInput.addEventListener('keydown', event => {
    if (event.key === 'Backspace' && event.target.value.endsWith('.')) event.target.value = event.target.value.slice(0, -1);
});

tg.MainButton.setText('Сохранить');
tg.MainButton.textColor = '#FFFFFF';
tg.MainButton.color = tg.themeParams.button_color || '#2481cc';
updateMainButton('formTab');
tg.MainButton.onClick(async () => {
    const username = nameInput.value.trim();
    const groupId = document.getElementById('groupSelect').value;
    const dateString = birthdayInput.value;
    const [day, month, year] = dateString.split('.');

    if (!/^[А-ЯЁ][а-яё]{1,14}$/.test(username)) return showAlert('Имя: 2–15 букв русского алфавита, первая буква заглавная');
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(dateString) || Number(day) > 31 || Number(month) > 12 || Number(year) < 1980 || Number(year) > 2015) {
        return showAlert('Пожалуйста, введите корректную дату рождения!');
    }

    tg.MainButton.disable();
    tg.MainButton.setText('Сохранение...');
    try {
        const response = await apiFetch(`${API_URL}/api/save-birthday`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, group_id: groupId, birthday: `${year}-${month}-${day}` })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Неизвестная ошибка');
        tg.MainButton.hide();
        document.getElementById('successModal').style.display = 'flex';
    } catch (error) {
        showAlert(`Ошибка сохранения: ${error.message}`);
        tg.MainButton.enable();
        tg.MainButton.setText('Сохранить');
    }
});

Promise.all([loadGroups(), loadUserData()]).catch(error => showAlert(error.message));
