import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { redirectIfAuthenticatedGuard } from './core/auth/redirect-if-authenticated.guard';
import { AppShell } from './core/shell/app-shell';

/**
 * Route tree per the UI/UX plan §1. Two shells, not three components:
 *
 *  - Every route below lives under a single `AppShell` instance, whose top
 *    bar and nav react to auth state rather than the tree branching into
 *    separate Public/App shell components — that's what makes "Public→App"
 *    (e.g. `/classes` looking different once you log in, same URL) fall out
 *    naturally instead of needing special-casing.
 *  - `/live/:sessionId` is the one deliberate exception: it sits completely
 *    outside `AppShell`, giving a true chrome-free immersive view rather than
 *    a shell that merely hides its own nav.
 *
 * Every feature is lazy (`loadComponent`) so `/classes` never pulls in, e.g.,
 * `livekit-client` for a route that will never open it.
 */
export const routes: Routes = [
  {
    path: '',
    component: AppShell,
    children: [
      {
        path: '',
        canActivate: [redirectIfAuthenticatedGuard],
        loadComponent: () => import('./features/marketing/marketing.page').then((m) => m.MarketingPage),
      },
      {
        path: 'classes',
        loadComponent: () => import('./features/catalog/catalog.page').then((m) => m.CatalogPage),
      },
      {
        path: 'classes/:classroomId',
        loadComponent: () =>
          import('./features/classroom/classroom-detail.page').then((m) => m.ClassroomDetailPage),
      },

      {
        path: 'login',
        canActivate: [redirectIfAuthenticatedGuard],
        loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        canActivate: [redirectIfAuthenticatedGuard],
        loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        canActivate: [redirectIfAuthenticatedGuard],
        loadComponent: () =>
          import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
      },
      {
        path: 'reset-password/:token',
        canActivate: [redirectIfAuthenticatedGuard],
        loadComponent: () =>
          import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
      },
      {
        // Not anon-only: a signed-in user can also land here (e.g. verifying
        // a second address), so no redirect guard.
        path: 'verify-email/:token',
        loadComponent: () => import('./features/auth/verify-email.page').then((m) => m.VerifyEmailPage),
      },

      {
        path: 'invite/:token',
        loadComponent: () =>
          import('./features/invitation/invitation-landing.page').then((m) => m.InvitationLandingPage),
      },

      {
        path: 'checkout',
        canActivate: [authGuard],
        children: [
          {
            path: 'classroom/:classroomId',
            data: { purpose: 'CLASS_ENROLLMENT' },
            loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
          },
          {
            path: 'recording/:recordingId',
            data: { purpose: 'RECORDING_ACCESS' },
            loadComponent: () => import('./features/checkout/checkout.page').then((m) => m.CheckoutPage),
          },
        ],
      },

      {
        path: 'my-classes',
        canActivate: [authGuard],
        loadComponent: () => import('./features/dashboard/my-classes.page').then((m) => m.MyClassesPage),
      },

      {
        path: 'host/classrooms',
        canActivate: [authGuard],
        children: [
          // Literal path before the `:id` param route below it, or 'new'
          // would be swallowed as an id.
          {
            path: 'new',
            loadComponent: () =>
              import('./features/host/create-classroom/create-classroom.page').then(
                (m) => m.CreateClassroomPage,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/host/classroom-manage/classroom-manage.page').then(
                (m) => m.ClassroomManagePage,
              ),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'details' },
              {
                path: 'details',
                loadComponent: () =>
                  import('./features/host/classroom-manage/manage-details.tab').then(
                    (m) => m.ManageDetailsTab,
                  ),
              },
              {
                path: 'sessions',
                loadComponent: () =>
                  import('./features/host/classroom-manage/manage-sessions.tab').then(
                    (m) => m.ManageSessionsTab,
                  ),
              },
              {
                path: 'enrollments',
                loadComponent: () =>
                  import('./features/host/classroom-manage/manage-enrollments.tab').then(
                    (m) => m.ManageEnrollmentsTab,
                  ),
              },
              {
                path: 'invitations',
                loadComponent: () =>
                  import('./features/host/classroom-manage/manage-invitations.tab').then(
                    (m) => m.ManageInvitationsTab,
                  ),
              },
            ],
          },
          {
            path: ':id/sessions/new',
            loadComponent: () =>
              import('./features/host/session-scheduler/session-scheduler.page').then(
                (m) => m.SessionSchedulerPage,
              ),
          },
          {
            path: ':id/invite',
            loadComponent: () =>
              import('./features/host/invite-composer/invite-composer.page').then(
                (m) => m.InviteComposerPage,
              ),
          },
        ],
      },

      {
        path: 'library',
        canActivate: [authGuard],
        loadComponent: () => import('./features/library/library.page').then((m) => m.LibraryPage),
      },
      {
        path: 'library/:recordingId',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/library/replay-player.page').then((m) => m.ReplayPlayerPage),
      },

      {
        path: 'account',
        canActivate: [authGuard],
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
      },

      {
        path: '**',
        loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
      },
    ],
  },

  // Immersive: outside AppShell entirely — see file header.
  {
    path: 'live/:sessionId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/live-room/live-room.page').then((m) => m.LiveRoomPage),
  },
];
