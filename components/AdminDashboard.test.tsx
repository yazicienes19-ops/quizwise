import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n/I18nProvider';
import { setLocale } from '../i18n';

const base = { plan: 'free', adminProUntil: null, isSuspended: false, isAdmin: false, createdAt: null, lastSignInAt: null, lastActiveAt: null, totalActiveSeconds: 0, last7DaysActiveSeconds: 0, monthCostEur: 0 };
vi.mock('../services/adminService', () => ({
  fetchAdminUsers: vi.fn(async () => [
    { ...base, id: 'a', email: 'a@x.de', name: 'Anna', study: { path: 'university', subject: 'Psychologie', stage: '1. Semester', currentTopic: 'Lernpsychologie', upcomingExam: null, goalText: null, freeText: null, goals: ['exam_prep'], challenges: ['retention'] } },
    { ...base, id: 'b', email: 'b@x.de', name: 'Ben', study: { path: 'university', subject: 'Psychologie', stage: null, currentTopic: null, upcomingExam: null, goalText: null, freeText: null, goals: [], challenges: [] } },
    { ...base, id: 'c', email: 'c@x.de', name: null, study: null },
  ]),
  fetchQuestionReports: vi.fn(async () => ({ groups: [], total: 0, setupMissing: false })),
  grantPro: vi.fn(), revokePro: vi.fn(), suspendUser: vi.fn(), unsuspendUser: vi.fn(),
}));
vi.mock('./AdminBudgetPanel', () => ({ AdminBudgetPanel: () => null, formatEur: (n: number) => `${n} €` }));

import { AdminDashboard } from './AdminDashboard';

describe('AdminDashboard: Studium-Angaben', () => {
  afterEach(cleanup);
  it('zeigt Bildungsweg, Fach und Semester je Nutzer und den Überblick', async () => {
    setLocale('de');
    render(<I18nProvider><AdminDashboard /></I18nProvider>);
    await waitFor(() => expect(screen.getByText('Studium · Psychologie · 1. Semester')).toBeTruthy());
    expect(screen.getByText('Thema: Lernpsychologie')).toBeTruthy();
    expect(screen.getByText('Ziele: Für eine Prüfung vorbereiten')).toBeTruthy();
    expect(screen.getByText('Schwierig: Behalten')).toBeTruthy();
    expect(screen.getByText('keine Angabe')).toBeTruthy();
    expect(screen.getByText('Studium 2 · ohne Angabe 1')).toBeTruthy();
    expect(screen.getByText('Fächer: Psychologie (2)')).toBeTruthy();
  });
});
