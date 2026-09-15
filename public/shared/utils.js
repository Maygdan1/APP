export function escapeHtml(value) {
    if (!value) return '';
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
}

export function formatDateToRussian(dateString, months) {
    if (!dateString) return 'Не указан';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const monthIndex = parseInt(parts[1], 10) - 1;
    return monthIndex >= 0 && monthIndex < 12
        ? `${parseInt(parts[2], 10)} ${months[monthIndex]}`
        : dateString;
}