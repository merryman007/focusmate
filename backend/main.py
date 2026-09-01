import os
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from database import (
    init_db,
    get_pending_tasks,
    get_completed_tasks,
    create_task,
    update_task,
    delete_task,
    clear_all_tasks,
    get_setting,
    set_setting,
    get_all_settings,
)
from ai_service import (
    parse_braindump,
    break_down_stuck_task,
    test_gemini_connection,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB on startup
    await init_db()
    yield


app = FastAPI(title="FocusMate - ADHD AI To-Do Assistant", lifespan=lifespan)

# Allow CORS for development if needed
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Request Models
class TaskCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    time_estimate_minutes: Optional[int] = 15
    suggested_time_of_day: Optional[str] = "Morning Focus"
    subtasks: Optional[List[str]] = []


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    time_estimate_minutes: Optional[int] = None
    suggested_time_of_day: Optional[str] = None
    status: Optional[str] = None
    order_index: Optional[int] = None
    subtasks: Optional[List[str]] = None
    sprint_duration_minutes: Optional[int] = None


class ReorderTasksRequest(BaseModel):
    task_ids: List[int]


class BrainDumpRequest(BaseModel):
    text: str


class BrainDumpConfirmRequest(BaseModel):
    tasks: List[Dict[str, Any]]
    clarification_answer: Optional[str] = None


class SettingsUpdateRequest(BaseModel):
    gemini_api_key: Optional[str] = None
    gemini_model: Optional[str] = None
    onboarded: Optional[str] = None


class TestApiKeyRequest(BaseModel):
    api_key: str
    model: Optional[str] = "gemini-3.6-flash"


# --- API Routes ---

@app.get("/api/tasks")
async def get_tasks():
    pending = await get_pending_tasks()
    completed = await get_completed_tasks()
    return {
        "pending": pending,
        "completed": completed,
        "current": pending[0] if pending else None,
        "remaining_count": len(pending),
        "completed_count": len(completed),
    }


@app.post("/api/tasks")
async def add_task(req: TaskCreateRequest):
    task = await create_task(
        title=req.title,
        description=req.description or "",
        time_estimate_minutes=req.time_estimate_minutes or 15,
        suggested_time_of_day=req.suggested_time_of_day or "Morning Focus",
        subtasks=req.subtasks or [],
    )
    return task


@app.patch("/api/tasks/{task_id}")
async def modify_task(task_id: int, req: TaskUpdateRequest):
    update_data = req.model_dump(exclude_unset=True)
    task = await update_task(task_id, **update_data)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/api/tasks/reorder")
async def reorder_task_list(req: ReorderTasksRequest):
    from database import reorder_tasks
    success = await reorder_tasks(req.task_ids)
    pending = await get_pending_tasks()
    return {"success": success, "pending": pending}


@app.delete("/api/tasks/{task_id}")
async def remove_task(task_id: int):
    success = await delete_task(task_id)
    return {"success": success}


@app.delete("/api/tasks")
async def reset_all_tasks():
    await clear_all_tasks()
    return {"success": True}


@app.post("/api/braindump/preview")
async def preview_braindump(req: BrainDumpRequest):
    """
    Parses braindump with AI and returns proposed tasks and optional MCQ clarification
    for user review BEFORE committing to DB.
    """
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Braindump cannot be empty")

    api_key = await get_setting("gemini_api_key", "")
    model_name = await get_setting("gemini_model", "gemini-3.6-flash")

    result = await parse_braindump(req.text, api_key=api_key, model_name=model_name)
    return result


@app.post("/api/braindump/confirm")
async def confirm_braindump(req: BrainDumpConfirmRequest):
    """
    Inserts user-accepted tasks from the preview into the database.
    """
    created_tasks = []
    for item in req.tasks:
        task = await create_task(
            title=item.get("title", "New Task"),
            description=item.get("description", ""),
            time_estimate_minutes=item.get("time_estimate_minutes", 15),
            suggested_time_of_day=item.get("suggested_time_of_day", "Morning Focus"),
            subtasks=item.get("subtasks", []),
        )
        created_tasks.append(task)

    return {
        "created_count": len(created_tasks),
        "tasks": created_tasks,
    }


# Backwards-compatible direct endpoint
@app.post("/api/braindump")
async def process_braindump(req: BrainDumpRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Braindump cannot be empty")

    api_key = await get_setting("gemini_api_key", "")
    model_name = await get_setting("gemini_model", "gemini-3.6-flash")

    result = await parse_braindump(req.text, api_key=api_key, model_name=model_name)
    parsed_items = result.get("tasks", [])

    created_tasks = []
    for item in parsed_items:
        task = await create_task(
            title=item.get("title", "New Task"),
            description=item.get("description", ""),
            time_estimate_minutes=item.get("time_estimate_minutes", 15),
            suggested_time_of_day=item.get("suggested_time_of_day", "Morning Focus"),
            subtasks=item.get("subtasks", []),
        )
        created_tasks.append(task)

    return {
        "created_count": len(created_tasks),
        "tasks": created_tasks,
    }


@app.post("/api/tasks/{task_id}/breakdown")
async def break_down_task(task_id: int):
    # Fetch task
    pending = await get_pending_tasks()
    target = next((t for t in pending if t["id"] == task_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Task not found")

    api_key = await get_setting("gemini_api_key", "")
    model_name = await get_setting("gemini_model", "gemini-3.7-flash")

    breakdown = await break_down_stuck_task(
        task_title=target["title"],
        task_description=target.get("description", ""),
        api_key=api_key,
        model_name=model_name,
    )

    # Save generated starter steps into the task's subtasks
    existing_subtasks = target.get("subtasks", [])
    new_subtasks = list(set(existing_subtasks + breakdown.get("starter_steps", [])))
    updated = await update_task(task_id, subtasks=new_subtasks)

    return {
        "task": updated,
        "starter_steps": breakdown.get("starter_steps", []),
        "encouragement": breakdown.get("encouragement", "You got this! Take it one tiny step at a time."),
    }


@app.get("/api/settings")
async def fetch_settings():
    settings = await get_all_settings()
    api_key = settings.get("gemini_api_key", "")
    # Mask API key for UI display
    masked_key = f"••••••••••••{api_key[-4:]}" if len(api_key) > 4 else ("••••" if api_key else "")
    return {
        "has_api_key": bool(api_key.strip()),
        "masked_api_key": masked_key,
        "gemini_model": settings.get("gemini_model", "gemini-3.7-flash"),
        "onboarded": settings.get("onboarded", "false") == "true",
    }


@app.post("/api/settings")
async def update_settings(req: SettingsUpdateRequest):
    if req.gemini_api_key is not None:
        await set_setting("gemini_api_key", req.gemini_api_key.strip())
    if req.gemini_model is not None:
        await set_setting("gemini_model", req.gemini_model.strip())
    if req.onboarded is not None:
        await set_setting("onboarded", req.onboarded)

    return await fetch_settings()


@app.post("/api/test-gemini")
async def test_api_key(req: TestApiKeyRequest):
    result = await test_gemini_connection(api_key=req.api_key, model_name=req.model or "gemini-3.7-flash")
    return result


# Mount Static Frontend
STATIC_DIR = os.environ.get("STATIC_DIR", "/app/frontend")
if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
