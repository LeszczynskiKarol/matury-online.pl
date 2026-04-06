import { atom, computed } from 'nanostores';
import { auth as authApi } from '../lib/api';

// ── User state ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  subscriptionStatus: string;
  subscriptionEnd: string | null;
  totalXp: number;
  globalLevel: number;
  currentStreak: number;
  longestStreak: number;
  selectedSubjects: { subject: { id: string; slug: string; name: string; icon: string; color: string } }[];
  subjectProgress: {
    subjectId: string;
    xp: number;
    level: number;
    questionsAnswered: number;
    correctAnswers: number;
    adaptiveDifficulty: number;
  }[];
}

export const $user = atom<User | null>(null);
export const $isLoading = atom(true);

export const $isAuthenticated = computed($user, (user) => user !== null);

export const $isPremium = computed($user, (user) => {
  if (!user) return false;
  if (user.subscriptionStatus === 'ACTIVE') return true;
  if (user.subscriptionStatus === 'ONE_TIME' && user.subscriptionEnd) {
    return new Date(user.subscriptionEnd) > new Date();
  }
  return false;
});

export const $isAdmin = computed($user, (user) => user?.role === 'ADMIN');

// ── Actions ────────────────────────────────────────────────────────────────

export async function initAuth() {
  $isLoading.set(true);
  try {
    const user = await authApi.me();
    $user.set(user);
  } catch {
    $user.set(null);
  } finally {
    $isLoading.set(false);
  }
}

export async function login(email: string, password: string) {
  const { user } = await authApi.login({ email, password });
  $user.set(user);
  return user;
}

export async function register(email: string, password: string, name?: string) {
  const { user } = await authApi.register({ email, password, name });
  $user.set(user);
  return user;
}

export async function googleLogin(credential: string) {
  const { user } = await authApi.google(credential);
  $user.set(user);
  return user;
}

export async function logout() {
  await authApi.logout();
  $user.set(null);
  window.location.href = '/';
}

// ── Gamification live state (updated after each answer) ────────────────────

export const $liveXp = atom(0);
export const $liveStreak = atom(0);
export const $xpPopup = atom<{ xp: number; visible: boolean }>({ xp: 0, visible: false });
export const $levelUpPopup = atom<{ level: number; subject: string; visible: boolean }>({ level: 0, subject: '', visible: false });
export const $achievementPopup = atom<{ name: string; icon: string; visible: boolean }>({ name: '', icon: '', visible: false });

export function showXpGain(xp: number) {
  $xpPopup.set({ xp, visible: true });
  setTimeout(() => $xpPopup.set({ xp: 0, visible: false }), 2000);
}

export function showLevelUp(level: number, subject: string) {
  $levelUpPopup.set({ level, subject, visible: true });
  setTimeout(() => $levelUpPopup.set({ level: 0, subject: '', visible: false }), 4000);
}

export function showAchievement(name: string, icon: string) {
  $achievementPopup.set({ name, icon, visible: true });
  setTimeout(() => $achievementPopup.set({ name: '', icon: '', visible: false }), 4000);
}
