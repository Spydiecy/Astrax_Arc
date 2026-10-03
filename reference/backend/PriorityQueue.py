import heapq
from datetime import datetime
from typing import List, Tuple, Optional

class TaskManager:
    def __init__(self):
        self.task_queue: List[Tuple[int, datetime, str]] = []  # (priority, timestamp, description)

    def add_task(self, description: str, priority: int) -> str:
        now = datetime.now()
        heapq.heappush(self.task_queue, (priority, now, description))
        return f"✅ Task added: '{description}' with priority {priority}"

    def get_next_task(self) -> Optional[str]:
        if not self.task_queue:
            return "📭 No tasks available."
        priority, timestamp, description = heapq.heappop(self.task_queue)
        return f"🔜 Next Task: '{description}' (Priority {priority})"

    def peek_all_tasks(self) -> List[str]:
        return [f"Priority {p} • {d} • Added at {t.strftime('%Y-%m-%d %H:%M:%S')}" for p, t, d in sorted(self.task_queue)]

# Example usage
if __name__ == "__main__":
    manager = TaskManager()
    print(manager.add_task("Review user submission", priority=2))
    print(manager.add_task("Generate weekly report", priority=1))
    print(manager.add_task("Send notification email", priority=3))

    print("\nAll Tasks:")
    for task in manager.peek_all_tasks():
        print(task)

    print("\nProcessing:")
    while True:
        result = manager.get_next_task()
        print(result)
        if result.startswith("📭"):
            break
