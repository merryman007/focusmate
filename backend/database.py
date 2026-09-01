import os
import json
import aiosqlite
from typing import List, Optional, Dict, Any

DB_PATH = os.environ.get("DB_PATH", "/app/data/focusmate.db")

# Ensure directory exists
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                time_estimate_minutes INTEGER DEFAULT 15,
                suggested_time_of_day TEXT DEFAULT 'Morning Focus',
                status TEXT DEFAULT 'pending', -- pending, completed, deferred
                order_index INTEGER DEFAULT 0,
                subtasks TEXT DEFAULT '[]', -- JSON array of strings
                sprint_duration_minutes INTEGER DEFAULT 15,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP
            )
            """
        )

        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )

        # Default settings if not present
        await db.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('gemini_model', 'gemini-3.6-flash')"
        )
        # Migrate any old 2.5 models if present
        await db.execute(
            "UPDATE settings SET value = 'gemini-3.6-flash' WHERE key = 'gemini_model' AND value LIKE '%gemini-2.5%'"
        )
        await db.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('onboarded', 'false')"
        )
        await db.commit()


async def get_setting(key: str, default: str = "") -> str:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT value FROM settings WHERE key = ?", (key,)) as cursor:
            row = await cursor.fetchone()
            return row["value"] if row else default


async def set_setting(key: str, value: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await db.commit()


async def get_all_settings() -> Dict[str, str]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("SELECT key, value FROM settings") as cursor:
            rows = await cursor.fetchall()
            return {row["key"]: row["value"] for row in rows}


async def get_pending_tasks() -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM tasks WHERE status = 'pending' ORDER BY order_index ASC, id ASC"
        ) as cursor:
            rows = await cursor.fetchall()
            tasks = []
            for row in rows:
                t = dict(row)
                t["subtasks"] = json.loads(t["subtasks"] or "[]")
                tasks.append(t)
            return tasks


async def get_completed_tasks() -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT * FROM tasks WHERE status = 'completed' ORDER BY completed_at DESC, id DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            tasks = []
            for row in rows:
                t = dict(row)
                t["subtasks"] = json.loads(t["subtasks"] or "[]")
                tasks.append(t)
            return tasks


async def create_task(
    title: str,
    description: str = "",
    time_estimate_minutes: int = 15,
    suggested_time_of_day: str = "Morning Focus",
    subtasks: List[str] = None,
    order_index: Optional[int] = None,
) -> Dict[str, Any]:
    subtasks_json = json.dumps(subtasks or [])
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if order_index is None:
            async with db.execute("SELECT COALESCE(MAX(order_index), -1) + 1 AS next_idx FROM tasks WHERE status = 'pending'") as cursor:
                row = await cursor.fetchone()
                order_index = row["next_idx"] if row else 0

        cursor = await db.execute(
            """
            INSERT INTO tasks (title, description, time_estimate_minutes, suggested_time_of_day, subtasks, order_index, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
            """,
            (title, description, time_estimate_minutes, suggested_time_of_day, subtasks_json, order_index),
        )
        task_id = cursor.lastrowid
        await db.commit()

        async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cur:
            row = await cur.fetchone()
            task = dict(row)
            task["subtasks"] = json.loads(task["subtasks"] or "[]")
            return task


async def update_task(task_id: int, **kwargs) -> Optional[Dict[str, Any]]:
    allowed_fields = [
        "title",
        "description",
        "time_estimate_minutes",
        "suggested_time_of_day",
        "status",
        "order_index",
        "subtasks",
        "sprint_duration_minutes",
    ]
    updates = []
    values = []

    for key, val in kwargs.items():
        if key in allowed_fields:
            if key == "subtasks" and isinstance(val, list):
                val = json.dumps(val)
            updates.append(f"{key} = ?")
            values.append(val)

    if "status" in kwargs and kwargs["status"] == "completed":
        updates.append("completed_at = CURRENT_TIMESTAMP")
    elif "status" in kwargs and kwargs["status"] == "pending":
        updates.append("completed_at = NULL")

    if not updates:
        return None

    values.append(task_id)
    query = f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?"

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        await db.execute(query, tuple(values))
        await db.commit()

        async with db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)) as cursor:
            row = await cursor.fetchone()
            if row:
                t = dict(row)
                t["subtasks"] = json.loads(t["subtasks"] or "[]")
                return t
            return None


async def delete_task(task_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()
        return True


async def reorder_tasks(task_ids: List[int]) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        for idx, task_id in enumerate(task_ids):
            await db.execute("UPDATE tasks SET order_index = ? WHERE id = ?", (idx, task_id))
        await db.commit()
        return True


async def clear_all_tasks():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks")
        await db.commit()
