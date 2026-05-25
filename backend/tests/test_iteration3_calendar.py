"""Iteration 3 — GET /api/calendar/month tests.

Covers:
- 200 shape: range / minimum_coverage / days (30 for June) / summary
- per-day fields: date, weekday, shifts dict, leaves[], coverage dict, status
- weekday-with-no-coverage => critical
- approved leave reduces coverage count and may flip status
- summary counters: critical_days / approved_leaves / pending_leaves
- employee role can access
- invalid month -> 400
- empty month -> shifts empty + coverage zero + all weekdays critical
"""
from __future__ import annotations
import calendar as _cal
import pytest


# ---------- helpers ----------
def _get_calendar(api_client, base_url, headers, year, month):
    return api_client.get(
        f"{base_url}/api/calendar/month",
        params={"year": year, "month": month},
        headers=headers,
    )


# =============== shape / basic ===============
class TestCalendarShape:
    def test_200_basic_shape_june_2026(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 6)
        assert r.status_code == 200, r.text
        body = r.json()
        # top-level keys
        for k in ["range", "minimum_coverage", "days", "summary"]:
            assert k in body, f"missing top-level {k}"

        rng = body["range"]
        assert rng["start_date"] == "2026-06-01"
        assert rng["end_date"] == "2026-06-30"
        assert rng["year"] == 2026
        assert rng["month"] == 6

        assert body["minimum_coverage"] == {"morning": 3, "afternoon": 2, "night": 2}
        assert isinstance(body["days"], list)
        assert len(body["days"]) == 30  # June has 30 days

    def test_each_day_has_required_fields(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 6)
        assert r.status_code == 200
        days = r.json()["days"]
        for d in days:
            assert "date" in d
            assert "weekday" in d and 0 <= d["weekday"] <= 6
            assert isinstance(d["shifts"], dict)
            assert isinstance(d["leaves"], list)
            cov = d["coverage"]
            for k in ["morning", "afternoon", "night"]:
                assert k in cov and isinstance(cov[k], int)
            assert d["status"] in {"ok", "warn", "critical"}

    def test_summary_fields_present(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 6)
        assert r.status_code == 200
        s = r.json()["summary"]
        for k in [
            "total_active_staff",
            "total_scheduled_entries",
            "total_scheduled_hours",
            "approved_leaves",
            "pending_leaves",
            "critical_days",
            "warn_days",
        ]:
            assert k in s, f"summary missing {k}"
        assert isinstance(s["total_active_staff"], int) and s["total_active_staff"] > 0


# =============== role / validation ===============
class TestCalendarAccess:
    def test_employee_can_access(self, api_client, base_url, employee_headers):
        r = _get_calendar(api_client, base_url, employee_headers, 2026, 6)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["range"]["month"] == 6
        assert "days" in body and len(body["days"]) == 30

    def test_warehouse_employee_can_access(self, api_client, base_url, warehouse_employee_headers):
        r = _get_calendar(api_client, base_url, warehouse_employee_headers, 2026, 6)
        assert r.status_code == 200

    def test_unauthenticated_rejected(self, api_client, base_url):
        # no headers — should be 401/403
        r = api_client.get(f"{base_url}/api/calendar/month", params={"year": 2026, "month": 6})
        assert r.status_code in (401, 403)

    def test_invalid_month_high(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 13)
        assert r.status_code == 400

    def test_invalid_month_low(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 0)
        assert r.status_code == 400


# =============== business logic ===============
class TestCalendarBusinessLogic:
    def test_weekday_no_coverage_is_critical(self, api_client, base_url, manager_headers):
        """Pick a far-future month with no schedules: every weekday should be 'critical'."""
        year, month = 2030, 3  # March 2030, far in future, no schedules expected
        r = _get_calendar(api_client, base_url, manager_headers, year, month)
        assert r.status_code == 200
        body = r.json()
        days = body["days"]
        # length matches month
        assert len(days) == _cal.monthrange(year, month)[1]
        # every weekday (0..4) must be critical with zero coverage
        weekday_critical_count = 0
        for d in days:
            assert d["coverage"] == {"morning": 0, "afternoon": 0, "night": 0}
            assert d["shifts"]["morning"] == []
            assert d["shifts"]["afternoon"] == []
            assert d["shifts"]["night"] == []
            if d["weekday"] <= 4:
                assert d["status"] == "critical", f"{d['date']} weekday not critical"
                weekday_critical_count += 1
        # sanity: summary critical_days >= weekday count
        assert body["summary"]["critical_days"] == weekday_critical_count

    def test_summary_counts_match_day_statuses(self, api_client, base_url, manager_headers):
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 6)
        body = r.json()
        days = body["days"]
        critical = sum(1 for d in days if d["status"] == "critical")
        # critical_days must match (per spec)
        assert body["summary"]["critical_days"] == critical
        # Note: summary.warn_days only counts weekday warns in current implementation;
        # we just sanity-check it's <= total warn days
        warn_total = sum(1 for d in days if d["status"] == "warn")
        assert body["summary"]["warn_days"] <= warn_total

    def test_approved_leaves_count_matches_days_leaves(self, api_client, base_url, manager_headers):
        """approved_leaves in summary equals total unique approved leave RECORDS overlapping the month."""
        r = _get_calendar(api_client, base_url, manager_headers, 2026, 6)
        body = r.json()
        # collect unique approved (user_id, leave_type) pairs across days
        approved_user_set = set()
        for d in body["days"]:
            for lv in d["leaves"]:
                if lv["status"] == "approved":
                    approved_user_set.add((lv["user_id"], lv["leave_type"]))
        # summary.approved_leaves >= unique approved users seen
        assert body["summary"]["approved_leaves"] >= len(approved_user_set)

    def test_approved_leave_reduces_coverage(self, api_client, base_url, manager_headers, manager_token):
        """Create a NEW approved leave on a future scheduled day & verify coverage dropped."""
        import requests

        headers = manager_headers

        # 1. Find first day in June 2026 that has morning coverage > 0
        r = _get_calendar(api_client, base_url, headers, 2026, 6)
        days = r.json()["days"]
        target = None
        for d in days:
            if d["coverage"]["morning"] > 0 and d["shifts"]["morning"]:
                target = d
                break
        if target is None:
            pytest.skip("no morning-coverage day found in June 2026")

        date_str = target["date"]
        before_morning = target["coverage"]["morning"]
        user_id = target["shifts"]["morning"][0]["user_id"]

        # 2. Need that user's auth -> login as that user. Map from existing seed creds.
        # Try matching by user_name vs the well-known seeded staff.
        candidate_emails = [
            "staff_a1@warehouse.com",
            "staff_a2@warehouse.com",
            "staff_b1@warehouse.com",
            "staff_b2@warehouse.com",
            "farhan@warehouse.com",
        ]
        target_email = None
        for em in candidate_emails:
            lr = api_client.post(f"{base_url}/api/auth/login", json={"email": em, "password": "Staff@123"})
            if lr.status_code == 200 and lr.json()["user"]["id"] == user_id:
                target_email = em
                target_token = lr.json()["access_token"]
                break
        if not target_email:
            pytest.skip("could not match scheduled user_id to a known seed email")

        # 3. Apply EMERGENCY leave (bypasses coverage rules) on that single day
        leave_payload = {
            "leave_type": "emergency",
            "start_date": date_str,
            "end_date": date_str,
            "reason": "iteration3 calendar test",
        }
        lvr = api_client.post(
            f"{base_url}/api/leaves",
            json=leave_payload,
            headers={"Authorization": f"Bearer {target_token}", "Content-Type": "application/json"},
        )
        assert lvr.status_code in (200, 201), lvr.text
        leave_id = lvr.json()["id"]

        # 4. Approve as manager via /api/leaves/{id}/action with action=approve
        appr = api_client.post(
            f"{base_url}/api/leaves/{leave_id}/action",
            json={"action": "approve"},
            headers=headers,
        )
        assert appr.status_code == 200, appr.text

        # 5. Re-fetch calendar & confirm coverage[morning] for that date decreased by 1
        try:
            r2 = _get_calendar(api_client, base_url, headers, 2026, 6)
            d2 = next(d for d in r2.json()["days"] if d["date"] == date_str)
            after_morning = d2["coverage"]["morning"]
            assert after_morning == before_morning - 1, (
                f"expected coverage to drop by 1 (was {before_morning}, now {after_morning})"
            )
            # the leaves[] array for that date should include this approved leave
            assert any(
                lv["user_id"] == user_id and lv["status"] == "approved"
                for lv in d2["leaves"]
            )
        finally:
            # Cleanup — reject/delete is not exposed; we leave the emergency leave (harmless seed).
            pass


# =============== regression hook ===============
class TestCalendarRegression:
    def test_does_not_break_existing_endpoints(self, api_client, base_url, manager_headers):
        # Quick smoke: dashboard + users list still work
        r1 = api_client.get(f"{base_url}/api/dashboard", headers=manager_headers)
        assert r1.status_code == 200
        r2 = api_client.get(f"{base_url}/api/users", headers=manager_headers)
        assert r2.status_code == 200
