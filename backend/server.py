"""Warehouse Workforce Management API.

FastAPI + MongoDB backend implementing:
- JWT auth with role-based access (manager, asst_manager, document_controller, employee)
- Employee management with admin approval
- Auto-generated rotating shift schedules (2-week cycles)
- Attendance tracking and monthly reports
- Leave management (annual, sick, comp-off, emergency) with coverage validation
"""
from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("warehouse")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ADMIN_ROLES = {"manager", "asst_manager", "document_controller"}
SHIFT_HOURS = {
    "morning": 9,      # 7-16
    "afternoon": 9,    # 12-21
    "night": 9,        # 21-06
    "admin": 9,        # 7:30-16:30
    "sat_day": 12,     # 7-19
    "sat_night": 12,   # 19-07
    "sun_day": 12,
    "sun_night": 12,
    "ega": 9,
    "off": 0,
    "leave": 0,
}
SHIFT_TIMES = {
    "morning": ("07:00", "16:00"),
    "afternoon": ("12:00", "21:00"),
    "night": ("21:00", "06:00"),
    "admin": ("07:30", "16:30"),
    "sat_day": ("07:00", "19:00"),
    "sat_night": ("19:00", "07:00"),
    "sun_day": ("07:00", "19:00"),
    "sun_night": ("19:00", "07:00"),
    "ega": ("07:00", "16:00"),
    "off": ("", ""),
    "leave": ("", ""),
}

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "employee"  # employee | manager | asst_manager | document_controller
    team: Optional[str] = None  # "A" | "B" | None (for admins)
    location: str = "warehouse"  # warehouse | ega


class UserPublic(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: str
    status: str  # pending | active | disabled
    team: Optional[str] = None
    location: str = "warehouse"
    default_shift: Optional[str] = None
    annual_leave_balance: float = 30
    sick_leave_balance: float = 12
    comp_off_balance: float = 0
    created_at: datetime


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    team: Optional[str] = None
    location: Optional[str] = None
    default_shift: Optional[str] = None
    status: Optional[str] = None
    annual_leave_balance: Optional[float] = None
    sick_leave_balance: Optional[float] = None
    comp_off_balance: Optional[float] = None


class ScheduleEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    shift_date: str  # YYYY-MM-DD
    shift_type: str  # morning | afternoon | night | admin | sat_day | sat_night | sun_day | sun_night | ega | off | leave
    start_time: str
    end_time: str
    hours: float
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ScheduleCreate(BaseModel):
    user_id: str
    shift_date: str
    shift_type: str
    notes: Optional[str] = None


class GenerateScheduleRequest(BaseModel):
    start_date: str  # Monday YYYY-MM-DD
    weeks: int = 2
    active_saturday_team: str = "A"  # which team works Saturday for week 1


class AttendanceMark(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    attendance_date: str  # YYYY-MM-DD
    status: str  # present | absent | late | half_day
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    hours_worked: float = 0
    shift_type: Optional[str] = None
    notes: Optional[str] = None
    marked_by: str
    marked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AttendanceCreate(BaseModel):
    user_id: Optional[str] = None  # None = self
    attendance_date: str
    status: str = "present"
    clock_in: Optional[str] = None
    clock_out: Optional[str] = None
    hours_worked: Optional[float] = None
    notes: Optional[str] = None


class LeaveRequest(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    leave_type: str  # annual | sick | comp_off | emergency
    start_date: str
    end_date: str
    days: float
    reason: str
    status: str = "pending"  # pending | approved | rejected
    approved_by: Optional[str] = None
    approval_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class LeaveCreate(BaseModel):
    leave_type: str
    start_date: str
    end_date: str
    reason: str


class LeaveAction(BaseModel):
    action: str  # approve | reject
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Lifespan: db connect + seed
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    app.state.client = client
    app.state.db = db

    await db.users.create_index("email", unique=True)
    await db.schedules.create_index([("user_id", 1), ("shift_date", 1)], unique=True)
    await db.attendance.create_index([("user_id", 1), ("attendance_date", 1)], unique=True)

    await _seed_initial_users(db)
    logger.info("Warehouse API ready")
    try:
        yield
    finally:
        client.close()


async def _seed_initial_users(db) -> None:
    """Seed manager/asst/dc + 11 staff (incl. Midhun/Ajay/Farhan) if missing."""
    seeds = [
        # admins
        {
            "email": os.environ["SEED_MANAGER_EMAIL"],
            "password": os.environ["SEED_MANAGER_PASSWORD"],
            "full_name": "Warehouse Manager",
            "role": "manager",
            "team": "A",
            "location": "warehouse",
            "default_shift": "admin",
            "status": "active",
        },
        {
            "email": os.environ["SEED_ASST_EMAIL"],
            "password": os.environ["SEED_ASST_PASSWORD"],
            "full_name": "Assistant Manager",
            "role": "asst_manager",
            "team": "B",
            "location": "warehouse",
            "default_shift": "admin",
            "status": "active",
        },
        {
            "email": os.environ["SEED_DC_EMAIL"],
            "password": os.environ["SEED_DC_PASSWORD"],
            "full_name": "Document Controller",
            "role": "document_controller",
            "team": None,
            "location": "warehouse",
            "default_shift": "admin",
            "status": "active",
        },
    ]
    # Team A staff (5)
    team_a = [
        ("MIDHUN", "midhun@warehouse.com", "ega"),
        ("AJAY", "ajay@warehouse.com", "ega"),
        ("FARHAN", "farhan@warehouse.com", "morning"),
        ("Staff A1", "staff_a1@warehouse.com", "morning"),
        ("Staff A2", "staff_a2@warehouse.com", "afternoon"),
    ]
    # Team B staff (4)
    team_b = [
        ("Staff B1", "staff_b1@warehouse.com", "morning"),
        ("Staff B2", "staff_b2@warehouse.com", "afternoon"),
        ("Staff B3", "staff_b3@warehouse.com", "night"),
        ("Staff B4", "staff_b4@warehouse.com", "night"),
    ]
    for name, email, shift in team_a:
        seeds.append({
            "email": email, "password": "Staff@123", "full_name": name,
            "role": "employee", "team": "A",
            "location": "ega" if shift == "ega" else "warehouse",
            "default_shift": shift, "status": "active",
        })
    for name, email, shift in team_b:
        seeds.append({
            "email": email, "password": "Staff@123", "full_name": name,
            "role": "employee", "team": "B",
            "location": "warehouse",
            "default_shift": shift, "status": "active",
        })

    for s in seeds:
        existing = await db.users.find_one({"email": s["email"]})
        if existing:
            continue
        doc = {
            "_id": str(uuid.uuid4()),
            "email": s["email"],
            "hashed_password": pwd_context.hash(s["password"]),
            "full_name": s["full_name"],
            "role": s["role"],
            "status": s["status"],
            "team": s.get("team"),
            "location": s.get("location", "warehouse"),
            "default_shift": s.get("default_shift"),
            "annual_leave_balance": 30,
            "sick_leave_balance": 12,
            "comp_off_balance": 0,
            "created_at": datetime.now(timezone.utc),
        }
        try:
            await db.users.insert_one(doc)
            logger.info("Seeded user: %s (%s)", s["email"], s["role"])
        except DuplicateKeyError:
            pass


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="Warehouse Workforce API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    return app.state.db


# ---------------------------------------------------------------------------
# Auth utils
# ---------------------------------------------------------------------------
def _create_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def _user_public(doc: dict) -> UserPublic:
    return UserPublic(
        id=doc["_id"],
        email=doc["email"],
        full_name=doc["full_name"],
        role=doc["role"],
        status=doc["status"],
        team=doc.get("team"),
        location=doc.get("location", "warehouse"),
        default_shift=doc.get("default_shift"),
        annual_leave_balance=doc.get("annual_leave_balance", 30),
        sick_leave_balance=doc.get("sick_leave_balance", 12),
        comp_off_balance=doc.get("comp_off_balance", 0),
        created_at=doc["created_at"],
    )


async def get_current_user(token: Annotated[Optional[str], Depends(oauth2_scheme)], db=Depends(get_db)) -> dict:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="account_not_active")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.post("/api/auth/register", response_model=UserPublic)
async def register(payload: UserCreate, db=Depends(get_db)):
    doc = {
        "_id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "hashed_password": pwd_context.hash(payload.password),
        "full_name": payload.full_name,
        "role": "employee",  # always employee via self-register
        "status": "pending",
        "team": payload.team,
        "location": payload.location,
        "default_shift": None,
        "annual_leave_balance": 30,
        "sick_leave_balance": 12,
        "comp_off_balance": 0,
        "created_at": datetime.now(timezone.utc),
    }
    try:
        await db.users.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email already registered")
    return _user_public(doc)


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db=Depends(get_db)):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not pwd_context.verify(payload.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user["status"] == "pending":
        raise HTTPException(status_code=403, detail="pending_approval")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="account_disabled")
    token = _create_token(user["_id"], user["role"])
    return TokenResponse(access_token=token, user=_user_public(user))


@app.get("/api/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return _user_public(user)


# ---------------------------------------------------------------------------
# Users (admin)
# ---------------------------------------------------------------------------
@app.get("/api/users", response_model=list[UserPublic])
async def list_users(
    status_filter: Optional[str] = None,
    role: Optional[str] = None,
    location: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    q: dict[str, Any] = {}
    if status_filter:
        q["status"] = status_filter
    if role:
        q["role"] = role
    if location:
        q["location"] = location
    docs = await db.users.find(q).sort("full_name", 1).to_list(500)
    return [_user_public(d) for d in docs]


@app.patch("/api/users/{user_id}", response_model=UserPublic)
async def update_user(user_id: str, payload: UserUpdate, admin: dict = Depends(require_admin), db=Depends(get_db)):
    update = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    res = await db.users.find_one_and_update(
        {"_id": user_id}, {"$set": update}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_public(res)


@app.post("/api/users/{user_id}/approve", response_model=UserPublic)
async def approve_user(user_id: str, admin: dict = Depends(require_admin), db=Depends(get_db)):
    res = await db.users.find_one_and_update(
        {"_id": user_id}, {"$set": {"status": "active"}}, return_document=True
    )
    if not res:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_public(res)


# ---------------------------------------------------------------------------
# Schedule
# ---------------------------------------------------------------------------
def _hours_for(shift_type: str) -> float:
    return SHIFT_HOURS.get(shift_type, 0)


def _times_for(shift_type: str) -> tuple[str, str]:
    return SHIFT_TIMES.get(shift_type, ("", ""))


@app.get("/api/schedules", response_model=list[ScheduleEntry])
async def get_schedules(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    q = {"shift_date": {"$gte": start_date, "$lte": end_date}}
    # Non-admins can only view their own schedule for now (still allow team view)
    if user["role"] not in ADMIN_ROLES and user_id and user_id != user["_id"]:
        raise HTTPException(status_code=403, detail="Cannot view other schedules")
    if user_id:
        q["user_id"] = user_id
    docs = await db.schedules.find(q, {"_id": 0}).sort("shift_date", 1).to_list(2000)
    return [ScheduleEntry(**d) for d in docs]


@app.post("/api/schedules", response_model=ScheduleEntry)
async def create_or_update_schedule(
    payload: ScheduleCreate, admin: dict = Depends(require_admin), db=Depends(get_db)
):
    u = await db.users.find_one({"_id": payload.user_id})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    start, end = _times_for(payload.shift_type)
    entry = ScheduleEntry(
        user_id=u["_id"],
        user_name=u["full_name"],
        shift_date=payload.shift_date,
        shift_type=payload.shift_type,
        start_time=start,
        end_time=end,
        hours=_hours_for(payload.shift_type),
        notes=payload.notes,
    )
    await db.schedules.update_one(
        {"user_id": u["_id"], "shift_date": payload.shift_date},
        {"$set": entry.dict()},
        upsert=True,
    )
    return entry


@app.delete("/api/schedules/{user_id}/{shift_date}")
async def delete_schedule(user_id: str, shift_date: str, admin: dict = Depends(require_admin), db=Depends(get_db)):
    await db.schedules.delete_one({"user_id": user_id, "shift_date": shift_date})
    return {"deleted": True}


@app.post("/api/schedules/generate")
async def generate_schedule(
    payload: GenerateScheduleRequest, admin: dict = Depends(require_admin), db=Depends(get_db)
):
    """Auto-generate a 2-week rotating schedule based on each employee's default_shift.

    Rules:
    - Manager/Asst Manager/DC: Mon-Fri admin shift (7:30-16:30)
      - 1st Saturday: Manager off, Asst+DC work admin shift
      - 2nd Saturday: Asst+DC off, Manager works admin shift
    - EGA staff: Mon-Sat ega shift, Sunday off
    - Warehouse staff (default_shift in morning/afternoon/night):
      - Mon-Fri: their default_shift
      - Saturday: if their team == active_saturday_team, work 12-hr shift; else off
      - Sunday: night-shift staff rotate through sun_day/sun_night
    """
    try:
        start = datetime.strptime(payload.start_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="start_date must be YYYY-MM-DD")
    if start.weekday() != 0:
        raise HTTPException(status_code=400, detail="start_date must be a Monday")

    days = payload.weeks * 7
    users = await db.users.find({"status": "active"}).to_list(200)
    saturday_teams = [payload.active_saturday_team]
    saturday_teams.append("B" if payload.active_saturday_team == "A" else "A")

    night_staff = [u for u in users if u.get("default_shift") == "night" and u.get("location") != "ega"]
    sunday_idx = 0

    generated = 0
    for i in range(days):
        day = start + timedelta(days=i)
        weekday = day.weekday()  # 0=Mon ... 6=Sun
        week_idx = i // 7
        date_str = day.isoformat()
        sat_team = saturday_teams[week_idx % 2]

        for u in users:
            role = u["role"]
            team = u.get("team")
            loc = u.get("location", "warehouse")
            shift_default = u.get("default_shift")
            shift_type = "off"

            if role in ADMIN_ROLES:
                if weekday <= 4:  # Mon-Fri
                    shift_type = "admin"
                elif weekday == 5:  # Saturday
                    if role == "manager":
                        shift_type = "off" if week_idx % 2 == 0 else "admin"
                    else:  # asst_manager / DC
                        shift_type = "admin" if week_idx % 2 == 0 else "off"
                else:
                    shift_type = "off"
            elif loc == "ega":
                shift_type = "ega" if weekday <= 5 else "off"
            else:
                if weekday <= 4:
                    shift_type = shift_default or "morning"
                elif weekday == 5:
                    if team == sat_team and shift_default in ("morning", "afternoon"):
                        shift_type = "sat_day"
                    elif team == sat_team and shift_default == "night":
                        shift_type = "sat_night"
                    else:
                        shift_type = "off"
                else:  # Sunday
                    if night_staff and u["_id"] == night_staff[sunday_idx % max(len(night_staff), 1)]["_id"]:
                        shift_type = "sun_day"
                    elif len(night_staff) > 1 and u["_id"] == night_staff[(sunday_idx + 1) % len(night_staff)]["_id"]:
                        shift_type = "sun_night"
                    else:
                        shift_type = "off"

            start_t, end_t = _times_for(shift_type)
            entry = {
                "id": str(uuid.uuid4()),
                "user_id": u["_id"],
                "user_name": u["full_name"],
                "shift_date": date_str,
                "shift_type": shift_type,
                "start_time": start_t,
                "end_time": end_t,
                "hours": _hours_for(shift_type),
                "notes": None,
                "created_at": datetime.now(timezone.utc),
            }
            await db.schedules.update_one(
                {"user_id": u["_id"], "shift_date": date_str},
                {"$set": entry},
                upsert=True,
            )
            generated += 1
        if weekday == 6:
            sunday_idx += 2

    return {"generated": generated, "days": days}


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------
def _compute_hours(clock_in: Optional[str], clock_out: Optional[str]) -> float:
    if not clock_in or not clock_out:
        return 0
    try:
        ci = datetime.strptime(clock_in, "%H:%M")
        co = datetime.strptime(clock_out, "%H:%M")
        if co < ci:
            co += timedelta(days=1)
        return round((co - ci).total_seconds() / 3600, 2)
    except ValueError:
        return 0


@app.post("/api/attendance", response_model=AttendanceMark)
async def mark_attendance(
    payload: AttendanceCreate, user: dict = Depends(get_current_user), db=Depends(get_db)
):
    target_id = payload.user_id or user["_id"]
    if target_id != user["_id"] and user["role"] not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Cannot mark for others")
    target = await db.users.find_one({"_id": target_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    sched = await db.schedules.find_one({"user_id": target_id, "shift_date": payload.attendance_date})
    hours = payload.hours_worked
    if hours is None:
        if payload.clock_in and payload.clock_out:
            hours = _compute_hours(payload.clock_in, payload.clock_out)
        elif sched and payload.status == "present":
            hours = sched.get("hours", 0)
        else:
            hours = 0

    record = AttendanceMark(
        user_id=target_id,
        user_name=target["full_name"],
        attendance_date=payload.attendance_date,
        status=payload.status,
        clock_in=payload.clock_in,
        clock_out=payload.clock_out,
        hours_worked=hours,
        shift_type=(sched or {}).get("shift_type"),
        notes=payload.notes,
        marked_by=user["_id"],
    )
    await db.attendance.update_one(
        {"user_id": target_id, "attendance_date": payload.attendance_date},
        {"$set": record.dict()},
        upsert=True,
    )
    return record


@app.get("/api/attendance", response_model=list[AttendanceMark])
async def get_attendance(
    start_date: str,
    end_date: str,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    q = {"attendance_date": {"$gte": start_date, "$lte": end_date}}
    if user["role"] not in ADMIN_ROLES:
        q["user_id"] = user["_id"]
    elif user_id:
        q["user_id"] = user_id
    docs = await db.attendance.find(q, {"_id": 0}).sort("attendance_date", 1).to_list(2000)
    return [AttendanceMark(**d) for d in docs]


@app.get("/api/attendance/monthly/{user_id}/{year}/{month}")
async def monthly_attendance(
    user_id: str, year: int, month: int,
    user: dict = Depends(get_current_user), db=Depends(get_db),
):
    if user["role"] not in ADMIN_ROLES and user_id != user["_id"]:
        raise HTTPException(status_code=403, detail="Cannot view others")
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    docs = await db.attendance.find(
        {"user_id": user_id, "attendance_date": {"$gte": start.isoformat(), "$lte": end.isoformat()}},
        {"_id": 0},
    ).to_list(500)
    total = sum(d.get("hours_worked", 0) for d in docs)
    present = sum(1 for d in docs if d["status"] == "present")
    absent = sum(1 for d in docs if d["status"] == "absent")
    late = sum(1 for d in docs if d["status"] == "late")
    half = sum(1 for d in docs if d["status"] == "half_day")
    return {
        "user_id": user_id,
        "year": year,
        "month": month,
        "total_hours": round(total, 2),
        "present": present,
        "absent": absent,
        "late": late,
        "half_day": half,
        "records": docs,
    }


# ---------------------------------------------------------------------------
# Leaves
# ---------------------------------------------------------------------------
def _date_range(start: str, end: str) -> list[str]:
    s = datetime.strptime(start, "%Y-%m-%d").date()
    e = datetime.strptime(end, "%Y-%m-%d").date()
    if e < s:
        return []
    return [(s + timedelta(days=i)).isoformat() for i in range((e - s).days + 1)]


async def _check_coverage(db, dates: list[str], excluding_user: str) -> dict:
    """Return per-date warehouse coverage status (excluding admins/EGA).

    If no schedule has been generated for a given date yet, that date is treated
    as 'ok' (cannot block leave on dates with no roster).
    """
    coverage = {}
    for d in dates:
        schedules = await db.schedules.find({"shift_date": d}).to_list(200)
        if not schedules:
            coverage[d] = {"morning": 0, "afternoon": 0, "night": 0, "ok": True, "no_schedule": True}
            continue
        leaves = await db.leaves.find({
            "status": "approved",
            "start_date": {"$lte": d},
            "end_date": {"$gte": d},
        }).to_list(100)
        on_leave_ids = {lv["user_id"] for lv in leaves}

        counts = {"morning": 0, "afternoon": 0, "night": 0}
        for s in schedules:
            if s["user_id"] == excluding_user:
                continue
            if s["user_id"] in on_leave_ids:
                continue
            if s["shift_type"] in counts:
                counts[s["shift_type"]] += 1
        ok = counts["morning"] >= 3 and counts["afternoon"] >= 2 and counts["night"] >= 2
        coverage[d] = {**counts, "ok": ok}
    return coverage


@app.post("/api/leaves", response_model=LeaveRequest)
async def apply_leave(
    payload: LeaveCreate, user: dict = Depends(get_current_user), db=Depends(get_db)
):
    dates = _date_range(payload.start_date, payload.end_date)
    if not dates:
        raise HTTPException(status_code=400, detail="Invalid date range")
    days = len(dates)

    # balance check
    if payload.leave_type == "annual" and user.get("annual_leave_balance", 0) < days:
        raise HTTPException(status_code=400, detail="Insufficient annual leave balance")
    if payload.leave_type == "sick" and user.get("sick_leave_balance", 0) < days:
        raise HTTPException(status_code=400, detail="Insufficient sick leave balance")
    if payload.leave_type == "comp_off" and user.get("comp_off_balance", 0) < days:
        raise HTTPException(status_code=400, detail="Insufficient comp-off balance")

    # coverage check (skip for emergency)
    if payload.leave_type != "emergency" and user.get("location") != "ega" and user["role"] not in ADMIN_ROLES:
        coverage = await _check_coverage(db, dates, user["_id"])
        bad = [d for d, c in coverage.items() if not c["ok"]]
        if bad:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "coverage_insufficient",
                    "message": "Minimum coverage (3 morning, 2 afternoon, 2 night) cannot be met on these dates. Use Emergency Leave.",
                    "dates": bad,
                    "coverage": coverage,
                },
            )

    leave = LeaveRequest(
        user_id=user["_id"],
        user_name=user["full_name"],
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        reason=payload.reason,
    )
    await db.leaves.insert_one(leave.dict())
    return leave


@app.get("/api/leaves", response_model=list[LeaveRequest])
async def list_leaves(
    status_filter: Optional[str] = None,
    user_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
    db=Depends(get_db),
):
    q: dict[str, Any] = {}
    if status_filter:
        q["status"] = status_filter
    if user["role"] not in ADMIN_ROLES:
        q["user_id"] = user["_id"]
    elif user_id:
        q["user_id"] = user_id
    docs = await db.leaves.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [LeaveRequest(**d) for d in docs]


@app.post("/api/leaves/{leave_id}/action", response_model=LeaveRequest)
async def act_on_leave(
    leave_id: str, payload: LeaveAction, admin: dict = Depends(require_admin), db=Depends(get_db)
):
    if payload.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    leave = await db.leaves.find_one({"id": leave_id})
    if not leave:
        raise HTTPException(status_code=404, detail="Leave not found")
    if leave["status"] != "pending":
        raise HTTPException(status_code=400, detail="Already processed")

    new_status = "approved" if payload.action == "approve" else "rejected"
    await db.leaves.update_one(
        {"id": leave_id},
        {"$set": {
            "status": new_status,
            "approved_by": admin["_id"],
            "approval_notes": payload.notes,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    # On approve: decrement balance + mark schedule as leave
    if new_status == "approved":
        field_map = {
            "annual": "annual_leave_balance",
            "sick": "sick_leave_balance",
            "comp_off": "comp_off_balance",
        }
        f = field_map.get(leave["leave_type"])
        if f:
            await db.users.update_one({"_id": leave["user_id"]}, {"$inc": {f: -leave["days"]}})
        for d in _date_range(leave["start_date"], leave["end_date"]):
            await db.schedules.update_one(
                {"user_id": leave["user_id"], "shift_date": d},
                {"$set": {
                    "shift_type": "leave",
                    "start_time": "",
                    "end_time": "",
                    "hours": 0,
                    "notes": f"On {leave['leave_type']} leave",
                }},
                upsert=False,
            )

    leave = await db.leaves.find_one({"id": leave_id}, {"_id": 0})
    return LeaveRequest(**leave)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@app.get("/api/dashboard")
async def dashboard(user: dict = Depends(get_current_user), db=Depends(get_db)):
    today = date.today().isoformat()
    today_schedule = await db.schedules.find_one({"user_id": user["_id"], "shift_date": today}, {"_id": 0})
    # this month attendance summary
    start_month = date.today().replace(day=1).isoformat()
    att_docs = await db.attendance.find(
        {"user_id": user["_id"], "attendance_date": {"$gte": start_month, "$lte": today}},
        {"_id": 0},
    ).to_list(50)
    hours_this_month = sum(a.get("hours_worked", 0) for a in att_docs)
    present_days = sum(1 for a in att_docs if a["status"] == "present")
    pending_leaves = await db.leaves.count_documents({"user_id": user["_id"], "status": "pending"})

    summary = {
        "today_schedule": today_schedule,
        "hours_this_month": round(hours_this_month, 2),
        "present_days_this_month": present_days,
        "pending_leaves": pending_leaves,
        "annual_leave_balance": user.get("annual_leave_balance", 0),
        "sick_leave_balance": user.get("sick_leave_balance", 0),
        "comp_off_balance": user.get("comp_off_balance", 0),
    }

    if user["role"] in ADMIN_ROLES:
        pending_users = await db.users.count_documents({"status": "pending"})
        pending_all_leaves = await db.leaves.count_documents({"status": "pending"})
        total_active = await db.users.count_documents({"status": "active"})
        # today coverage
        today_sched = await db.schedules.find({"shift_date": today}).to_list(50)
        counts = {"morning": 0, "afternoon": 0, "night": 0, "admin": 0, "ega": 0}
        for s in today_sched:
            if s["shift_type"] in counts:
                counts[s["shift_type"]] += 1
        summary["admin"] = {
            "pending_user_approvals": pending_users,
            "pending_leave_approvals": pending_all_leaves,
            "total_active_users": total_active,
            "today_coverage": counts,
        }
    return summary


@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}
