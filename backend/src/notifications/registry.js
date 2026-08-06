/**
 * Registry aller Notification-Typen. Ein neuer Typ = eine neue Datei unter
 * ./types mit derselben Form { id, evaluate(ctx) } + ein Eintrag hier —
 * der Scheduler selbst muss dafür nicht angefasst werden.
 */
const dailyReminder = require('./types/dailyReminder');
const blockLeadTime = require('./types/blockLeadTime');
const spacedRepetition = require('./types/spacedRepetition');
const examCountdown = require('./types/examCountdown');
const motivation = require('./types/motivation');

const NOTIFICATION_TYPES = [dailyReminder, blockLeadTime, spacedRepetition, examCountdown, motivation];

module.exports = { NOTIFICATION_TYPES };
