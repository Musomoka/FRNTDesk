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
 * That exception has to be declared FIRST. `AppShell` sits at `path: ''` with
 * a `**` child, and a prefix match on '' means the router descends into those
 * children for every URL — where the wildcard claims `/live/:sessionId` and
 * renders "page not found" instead. Order is what keeps the live room
 * reachable at all; it is not cosmetic.
 *
 * Every feature is lazy (`loadComponent`) so `/classes` never pulls in, e.g.,
 * `livekit-client` for a route that will never open it.
 */
export const routes: Routes = [
  // Immersive: outside AppShell entirely — see file header for why it is first.
  {
    path: 'live/:sessionId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/live-room/live-room.page').then((m) => m.LiveRoomPage),
  },

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
        path: 'organisations',
        loadComponent: () =>
          import('./features/organisations/organisations.page').then((m) => m.OrganisationsPage),
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
      // No forgot-password / reset-password / verify-email routes: Auth0
      // Universal Login owns all three end to end. Password changes go
      // through AuthStore.requestPasswordChange from the account page, and
      // verification is Auth0's own email — this app never sees either.
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
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./features/host/host-classrooms.page').then((m) => m.HostClassroomsPage),
          },
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
];
