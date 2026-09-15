import { state, MONTH_NAMES, MONTHS_GENITIVE } from './state.js';
import { escapeHtml } from '../shared/utils.js';
import { formatShortGroupName } from './users.js';

export function renderCalendar() {
    const period = document.getElementById('calendarPeriod')?.value || '12';
    const container = document.getElementById('calendarContainer');
    container.innerHTML = '';
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const birthdayMap = {};

    const selectedGroups = state.selectedCalendarGroups;
    const ownMode = selectedGroups.includes('__mine__');
    const selectedIds = selectedGroups.filter(groupId => groupId !== '__mine__');
    state.users.filter(user => {
        const userGroupIds = (user.group_ids || []).map(item => String(item._id));
        if (ownMode && userGroupIds.some(groupId => state.ownGroups.includes(groupId))) return true;
        return !selectedIds.length && !ownMode || userGroupIds.some(groupId => selectedIds.includes(groupId));
    }).forEach(user => {
        if (!user.birthday) return;
        const [birthYear, month, day] = user.birthday.split('-');
        const groups = (user.group_ids || []).map(item => state.groups.find(group => String(group._id) === String(item._id)))
            .filter(Boolean).map(group => formatShortGroupName(group.name)).join(', ');
        const key = `${month}-${day}`;
        (birthdayMap[key] ||= []).push({ name: user.username || 'Студент', username: user.tg_username || '', birthYear: Number(birthYear), groups });
    });

    const periods = [];
    if (period === '1') periods.push({ monthIndex: currentMonth, year: currentYear });
    else if (period === '6-1') for (let month = 0; month < 6; month++) periods.push({ monthIndex: month, year: currentYear });
    else if (period === '6-2') for (let month = 6; month < 12; month++) periods.push({ monthIndex: month, year: currentYear });
    else for (let index = 0; index < 12; index++) periods.push({ monthIndex: (currentMonth + index) % 12, year: currentYear + (currentMonth + index >= 12 ? 1 : 0) });

    periods.forEach(({ monthIndex, year }) => {
        const card = document.createElement('div');
        card.className = 'month-card';
        card.innerHTML = `<h4 class="month-title">${MONTH_NAMES[monthIndex]} ${period === '12' ? year : ''}</h4>`;
        const grid = document.createElement('div');
        grid.className = 'days-grid';
        const summary = [];
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const people = birthdayMap[`${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`] || [];
            const cell = document.createElement('div');
            cell.className = `day-cell ${people.length ? 'has-bday' : ''}`;
            cell.innerHTML = `<span class="day-number">${day}</span>${people.length ? `<div class="bday-badge-count">🎉 ${people.length}</div>` : ''}`;
            grid.appendChild(cell);
            people.forEach(person => summary.push({ ...person, day, age: person.birthYear > 1900 ? year - person.birthYear : '' }));
        }
        card.appendChild(grid);
        if (summary.length) {
            const summaryElement = document.createElement('div');
            summaryElement.className = 'month-bday-summary';
            summaryElement.innerHTML = summary.map(person => `📅 <b>${person.day} ${MONTHS_GENITIVE[monthIndex]}</b> — ${escapeHtml(person.name)} ${person.age || ''} ${escapeHtml(person.username ? `(@${person.username})` : '')} <span class="group-tag-inline">${escapeHtml(person.groups)}</span>`).join('');
            card.appendChild(summaryElement);
        }
        container.appendChild(card);
    });
}