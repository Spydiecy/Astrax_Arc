from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
import time

scheduler = BackgroundScheduler()
scheduler.start()

# Example registry to simulate scheduled jobs
job_registry = []

def schedule_token_transfer(to_address: str, amount: float, run_at: datetime):
    """
    Schedules a token transfer at a specified datetime.
    This function stores the job in a registry and logs it.
    """
    def mock_transfer():
        print(f"Executing transfer of {amount} tokens to {to_address} at {datetime.now()}.")
        job_registry.append({"address": to_address, "amount": amount, "executed_at": datetime.now().isoformat()})

    scheduler.add_job(mock_transfer, 'date', run_date=run_at)
    return f"Scheduled transfer of {amount} tokens to {to_address} at {run_at.strftime('%Y-%m-%d %H:%M:%S')}"


def list_scheduled_jobs():
    """
    Lists all jobs that are currently registered in the scheduler.
    """
    jobs = scheduler.get_jobs()
    return [f"Job {i+1}: Next Run - {job.next_run_time}" for i, job in enumerate(jobs)]


def get_execution_log():
    """
    Returns the history of executed token transfers.
    """
    return job_registry

# Opti