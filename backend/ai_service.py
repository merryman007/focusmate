import os
import re
import json
import time
import hashlib
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None
    types = None


# --- In-Memory Response Cache (Zero API calls on identical/repeated inputs) ---
_AI_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 3600  # 1 hour cache

# --- Rate Limit Tracker (15 RPM Free-Tier Guard) ---
_REQUEST_TIMESTAMPS: List[float] = []
_MAX_RPM = 12  # Keep safely under the 15 RPM free tier ceiling


def _generate_cache_key(prefix: str, content: str) -> str:
    hash_obj = hashlib.sha256(content.strip().lower().encode("utf-8"))
    return f"{prefix}:{hash_obj.hexdigest()}"


def _get_from_cache(cache_key: str) -> Optional[Any]:
    if cache_key in _AI_CACHE:
        entry = _AI_CACHE[cache_key]
        if time.time() - entry["timestamp"] < _CACHE_TTL_SECONDS:
            return entry["data"]
        else:
            del _AI_CACHE[cache_key]
    return None


def _save_to_cache(cache_key: str, data: Any):
    _AI_CACHE[cache_key] = {
        "timestamp": time.time(),
        "data": data
    }


def _is_rate_limited() -> bool:
    """
    Sliding window rate-limiter: returns True if we exceed 12 requests in the last 60 seconds.
    """
    now = time.time()
    # Retain only timestamps from the last 60 seconds
    while _REQUEST_TIMESTAMPS and now - _REQUEST_TIMESTAMPS[0] > 60:
        _REQUEST_TIMESTAMPS.pop(0)

    if len(_REQUEST_TIMESTAMPS) >= _MAX_RPM:
        return True

    _REQUEST_TIMESTAMPS.append(now)
    return False


class ParsedTask(BaseModel):
    title: str = Field(description="Clear, atomic task title with action verb. Tool-agnostic.")
    description: str = Field(default="", description="Helpful brief notes or context")
    time_estimate_minutes: int = Field(default=15, description="Realistic estimated time in minutes (5 to 45 mins max)")
    suggested_time_of_day: str = Field(default="Morning Focus", description="e.g. 'Morning Focus', 'Midday Momentum', 'Afternoon Flow', 'Quick Win', 'Evening Calm'")
    subtasks: List[str] = Field(default_factory=list, description="1-3 immediate starter micro-steps if the task is complex")


class BrainDumpResult(BaseModel):
    tasks: List[ParsedTask] = Field(description="List of atomic actionable tasks extracted from the brain dump")
    has_clarification: bool = Field(default=False, description="True if any task is ambiguous and would benefit from a quick single choice from user")
    clarification_question: Optional[str] = Field(default="", description="Short, friendly multiple choice question if clarification is helpful")
    clarification_options: List[str] = Field(default_factory=list, description="2 to 4 quick multiple-choice options for the user to tap")


class StuckBreakdownResult(BaseModel):
    starter_steps: List[str] = Field(description="2 to 4 ultra-small, 2-minute starter micro-steps focusing on the core action without assuming specific software")
    encouragement: str = Field(description="A short, warm, non-cheesy ADHD-friendly encouragement phrase")


def _local_fallback_parser(text: str) -> List[Dict[str, Any]]:
    """
    Offline/No-API-Key fallback parser that intelligently splits braindumps
    by newlines, numbered lists, bullet points, commas, and common conjunctions.
    """
    lines = [line.strip() for line in text.replace("\r\n", "\n").split("\n") if line.strip()]
    raw_tasks = []

    for line in lines:
        cleaned = re.sub(r"^(\d+[\.\)]|\-|\*|•|\>)\s*", "", line).strip()
        if not cleaned:
            continue

        # Normalize conjunctions like 'and also', 'and then', 'also', 'and' into comma delimiters
        normalized = re.sub(r"\s+(?:and\s+also|and\s+then|also|and)\s+", ", ", cleaned, flags=re.IGNORECASE)
        parts = [p.strip() for p in re.split(r"[,;\n]+", normalized) if p.strip()]

        for part in parts:
            # Clean leading 'need to', 'i have to', 'i need to', etc. for punchy titles
            part = re.sub(r"^(?:i\s+need\s+to|need\s+to|i\s+have\s+to|have\s+to|must|should)\s+", "", part, flags=re.IGNORECASE).strip()
            if part:
                raw_tasks.append(part)

    parsed = []
    times_of_day = ["Morning Focus", "Midday Momentum", "Afternoon Flow", "Quick Win"]

    for idx, item in enumerate(raw_tasks):
        title = item[0].upper() + item[1:] if len(item) > 1 else item.upper()
        # Heuristic time estimation based on keywords
        est_min = 15
        if any(w in title.lower() for w in ["email", "reply", "call", "text", "slack", "message"]):
            est_min = 10
            tod = "Quick Win"
        elif any(w in title.lower() for w in ["clean", "tidy", "trash", "dishes", "laundry"]):
            est_min = 15
            tod = "Morning Focus"
        elif any(w in title.lower() for w in ["write", "code", "design", "plan", "review", "slide", "report"]):
            est_min = 25
            tod = "Midday Momentum"
        else:
            tod = times_of_day[idx % len(times_of_day)]

        parsed.append({
            "title": title,
            "description": "",
            "time_estimate_minutes": est_min,
            "suggested_time_of_day": tod,
            "subtasks": []
        })

    return parsed


async def parse_braindump(text: str, api_key: Optional[str] = None, model_name: str = "gemini-3.6-flash") -> Dict[str, Any]:
    """
    Uses Gemini API (or local fallback) to turn unstructured stream of consciousness into atomic focus tasks.
    Protected with SHA-256 caching and sliding-window rate limit armor.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY", "").strip()

    if not key or not genai:
        return {
            "tasks": _local_fallback_parser(text),
            "has_clarification": False,
            "clarification_question": "",
            "clarification_options": []
        }

    # 1. Check in-memory cache first (Zero API call!)
    cache_key = _generate_cache_key("braindump", text)
    cached = _get_from_cache(cache_key)
    if cached:
        print(f"Serving braindump from memory cache for key: {cache_key[:12]}...")
        return cached

    # 2. Check rate limit buffer (Prevent 429 errors)
    if _is_rate_limited():
        print("Rate limit threshold approached (>12 RPM). Falling back to smart local parser to preserve API quota.")
        return {
            "tasks": _local_fallback_parser(text),
            "has_clarification": False,
            "clarification_question": "",
            "clarification_options": []
        }

    # Sanitize model name
    effective_model = model_name or "gemini-3.6-flash"
    if "gemini-2.5" in effective_model or "gemini-2.0" in effective_model or "gemini-1.5" in effective_model:
        effective_model = "gemini-3.6-flash"

    try:
        client = genai.Client(api_key=key)
        prompt = f"""
You are an expert ADHD executive function assistant and body double.
The user has provided a messy, raw "brain dump" of thoughts and tasks:

<BRAIN_DUMP>
{text}
</BRAIN_DUMP>

Your goal is to parse this into atomic, realistic, actionable to-do items following strict ADHD principles:
1. De-chunk vague or intimidating tasks into actionable single actions.
2. Keep tasks small and manageable (aim for 5 to 30 mins each).
3. Assign realistic time estimates (minutes) to combat time blindness.
4. Assign a suggested time of day / energy block (e.g. 'Morning Focus', 'Midday Momentum', 'Afternoon Flow', 'Quick Win', 'Evening Calm').
5. If a task is still slightly complex, provide 1 to 3 immediate starter subtasks.
6. Order them logically so quick wins or easiest entry points build momentum first.

CRITICAL WORKFLOW & TOOL-AGNOSTIC RULES:
- NEVER prescribe specific software, hardware, or apps unless the user explicitly mentioned it in their dump (e.g. do NOT say "Open Apple Notes", "Open Google Docs", "Go to your iPhone notes app", "Open Spotify").
- Focus on the core cognitive action (e.g. "Draft the 3 main bullet points", "Reply to Sarah's last message", "Outline the introduction").
- If there is an ambiguous priority or sequence choice, set `has_clarification = true` and provide a short, friendly question in `clarification_question` with 2-3 quick clickable answers in `clarification_options`.
"""
        response = client.models.generate_content(
            model=effective_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BrainDumpResult,
                temperature=0.2,
            )
        )

        data = json.loads(response.text)
        result = {
            "tasks": data.get("tasks", []),
            "has_clarification": data.get("has_clarification", False),
            "clarification_question": data.get("clarification_question", ""),
            "clarification_options": data.get("clarification_options", [])
        }
        # Save in cache
        _save_to_cache(cache_key, result)
        return result
    except Exception as e:
        print(f"Gemini API call returned: {e}. Falling back to smart local parser.")
        return {
            "tasks": _local_fallback_parser(text),
            "has_clarification": False,
            "clarification_question": "",
            "clarification_options": []
        }


async def break_down_stuck_task(task_title: str, task_description: str = "", api_key: Optional[str] = None, model_name: str = "gemini-3.6-flash") -> Dict[str, Any]:
    """
    Takes an intimidating task and produces 2-4 tiny 2-minute starter steps to crush starting paralysis.
    Protected with SHA-256 caching and rate limit armor.
    """
    key = api_key or os.environ.get("GEMINI_API_KEY", "").strip()

    if not key or not genai:
        return {
            "starter_steps": [
                f"Identify the very first 60-second action for: {task_title}",
                "Take one deep breath and set a 5-minute gentle sprint",
                "Do just the first sentence or bullet point"
            ],
            "encouragement": "Starting is the hardest 80%. You don't have to finish right now, just do step 1!"
        }

    # 1. Check cache first
    cache_key = _generate_cache_key("stuck", f"{task_title}:{task_description}")
    cached = _get_from_cache(cache_key)
    if cached:
        print(f"Serving task breakdown from cache for: {task_title[:20]}...")
        return cached

    # 2. Rate limit check
    if _is_rate_limited():
        print("Rate limit threshold reached. Serving local starter steps.")
        return {
            "starter_steps": [
                f"Identify the first single bullet point for: {task_title}",
                "Spend just 2 minutes getting the starter thought down",
                "Celebrate starting—momentum will take over!"
            ],
            "encouragement": "Starting is the only victory that matters right now. Take it one tiny action at a time!"
        }

    effective_model = model_name or "gemini-3.6-flash"
    if "gemini-2.5" in effective_model or "gemini-2.0" in effective_model or "gemini-1.5" in effective_model:
        effective_model = "gemini-3.6-flash"

    try:
        client = genai.Client(api_key=key)
        prompt = f"""
The user has ADHD and is currently FROZEN or stuck on this task due to executive dysfunction / overwhelm:
Task: "{task_title}"
Notes: "{task_description}"

Generate 3-4 ridiculously easy micro-steps (2-minute starter steps) that require almost zero cognitive load to begin.
CRITICAL RULE: DO NOT dictate specific apps (e.g. do NOT say "Open Apple Notes" or "Go to Word"). Instead, focus on the immediate atomic starter action (e.g., "Write down just the title or greeting", "Find the relevant file/link", "Skim the first paragraph").
Also include a warm, encouraging, non-patronizing sentence.
"""
        response = client.models.generate_content(
            model=effective_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=StuckBreakdownResult,
                temperature=0.3,
            )
        )

        data = json.loads(response.text)
        _save_to_cache(cache_key, data)
        return data
    except Exception as e:
        print(f"Error calling Gemini API for stuck breakdown: {e}")
        return {
            "starter_steps": [
                f"Identify the first single bullet point for: {task_title}",
                "Spend just 2 minutes getting the starter thought down",
                "Celebrate starting—momentum will take over!"
            ],
            "encouragement": "Starting is the only victory that matters right now. Take it one tiny action at a time!"
        }


async def test_gemini_connection(api_key: str, model_name: str = "gemini-3.6-flash") -> Dict[str, Any]:
    """
    Validates that a provided Gemini API key works properly.
    """
    if not genai:
        return {"success": False, "error": "google-genai SDK not installed in container."}

    effective_model = model_name or "gemini-3.6-flash"
    if "gemini-2.5" in effective_model or "gemini-2.0" in effective_model or "gemini-1.5" in effective_model:
        effective_model = "gemini-3.6-flash"

    try:
        client = genai.Client(api_key=api_key.strip())
        response = client.models.generate_content(
            model=effective_model,
            contents="Say 'OK' if you can read this."
        )
        return {"success": True, "message": "Gemini API key is valid and working!", "reply": response.text.strip()}
    except Exception as e:
        return {"success": False, "error": str(e)}
