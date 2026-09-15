export const state = {
    users: [],
    role: 'student',
    groups: [],
    mentorGroups: [],
        ownGroups: [],
    selectedCalendarGroups: [],
    selectedUsersGroup: '',
        currentUser: null,
        selectedMentorGroup: '',
};

export const MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export const MONTHS_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];