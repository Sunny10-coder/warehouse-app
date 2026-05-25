# Warehouse Workforce Management — PRD

## Overview
A React Native Expo mobile app (with web preview) for a 14-person warehouse team to manage shift schedules, attendance, and leaves. Backend: FastAPI + MongoDB. Auth: JWT.

## Team Composition
- 14 total members
- Roles: Manager, Assistant Manager, Document Controller, Employee (Staff)
- Teams: Team A (Manager + 5 staff) / Team B (Asst Mgr + 4 staff) / DC (no team)
- Locations: warehouse (12) / EGA (2 flexible from MIDHUN/AJAY/FARHAN)

## Shift Rules
- **Mon–Fri**: 3 morning (7-16), 2 afternoon (12-21), 2 night (21-06)
- **Manager/Asst Mgr/DC**: Mon–Fri admin (7:30-16:30). Manager off 1st Sat, Asst+DC off 2nd Sat (alternating)
- **Saturday**: Active team works 12-hr shifts (day 7-19, night 19-7), alternates each week
- **Sunday**: 1 day + 1 night person (12-hr), rotating among night-shift staff
- **EGA staff**: Mon-Sat ega shift, Sun off
- 2-week rotating cycles
- Sunday workers earn comp-off credits

## Core Features Implemented
1. **Auth** — JWT login, self-register (admin approval required), 4 seeded admins + 9 staff
2. **Auto-Schedule Generator** — POST `/api/schedules/generate` builds 2-week schedule honoring all rules
3. **Schedule View** — Weekly horizontal day-strip + day-detail entries with shift color coding (morning=yellow, afternoon=orange, night=cyan)
4. **Attendance** — Quick mark (present/late) or clock in/out with HH:MM; monthly stats (total hours, present days)
5. **Leave Management** — 4 types (annual=30/yr, sick=12/yr, comp_off, emergency); minimum-coverage validation (3M/2A/2N) blocks regular leaves; emergency leave bypasses; balance auto-decrement on approval; schedule auto-marked as "leave"
6. **Admin Console** — pending leave approvals, user approval, edit shift/team/location per staff, auto-generate 2-week schedule
7. **Dashboard** — today's shift card, monthly hours/present days, leave balances, admin overview (pending approvals + today coverage)
8. **Profile** — view role/team/balances, sign out

## Tech Stack
- **Frontend**: Expo Router (file-based), React Native, axios, expo-secure-store for JWT
- **Backend**: FastAPI, motor (MongoDB async), passlib+bcrypt, python-jose JWT (HS256)
- **Theme**: Tactical Dark — `#0A0A0A` base, 1px grid borders, no shadows

## API Endpoints
- `POST /api/auth/register|login` · `GET /api/auth/me`
- `GET /api/users` (filters: status, role, location) · `PATCH /api/users/{id}` · `POST /api/users/{id}/approve`
- `GET/POST /api/schedules` · `POST /api/schedules/generate` · `DELETE /api/schedules/{uid}/{date}`
- `GET/POST /api/attendance` · `GET /api/attendance/monthly/{uid}/{year}/{month}`
- `GET/POST /api/leaves` · `POST /api/leaves/{id}/action`
- `GET /api/dashboard` · `GET /api/health`

## Smart Enhancement
**Built-in coverage intelligence**: The leave application form auto-rejects requests that would drop coverage below the 3-morning/2-afternoon/2-night minimum, forcing employees to use Emergency Leave instead — protecting business continuity automatically without manager intervention. This catches scheduling conflicts before they become operational crises.

## Deployment Notes
- Free hosting on Emergent preview; user can `Save to GitHub` then deploy backend to Railway/Render and frontend to Vercel (all free tiers).
- iOS/Android builds via Emergent publish button.
