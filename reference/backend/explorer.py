# Sonic Explorer Module
from typing import List, Dict
from datetime import datetime, timedelta
import random


def get_transactions(wallet: str) -> List[Dict]:
    """
    Returns a list of transaction dictionaries for the provided wallet address.
    """
    return [
        {
            "tx_hash": f"0x{random.randint(10**15, 10**16 - 1):x}",
            "from": wallet,
            "to": "0xReceiverAddress",
            "value": random.randint(1, 10),
            "timestamp": datetime.now().isoformat()
        } for _ in range(5)
    ]

def get_block_type_data(block_type: str) -> Dict:
    """
    Returns summary data for a specified type of block.
    """
    return {
        "type": block_type,
        "count": random.randint(100, 500),
        "avg_tx_per_block": round(random.uniform(0, 2.5), 2)
    }

def get_transaction_chart_data() -> Dict:
    """
    Provides chart-ready transaction volume data over the past 7 days.
    """
    return {
        "labels": [f"Day {i}" for i in range(1, 8)],
        "values": [random.randint(50, 200) for _ in range(7)]
    }

def get_market_chart_data() -> Dict:
    """
    Returns sample market data including timestamps and price values.
    """
    now = datetime.now()
    return {
        "timestamps": [(now - timedelta(days=i)).isoformat() for i in range(7)],
        "prices": [round(random.uniform(0.1, 2.0), 2) for _ in range(7)]
    }

def get_block_by_number_or_hash(block: str) -> Dict:
    """
    Retrieves data for a specific block by number or hash.
    """
    return {
        "block_id": block,
        "miner": "0xMinerExample0000000000",
        "tx_count": random.randint(0, 50),
        "timestamp": datetime.now().isoformat()
    }

def get_native_coin_holders() -> List[Dict]:
    """
    Returns a list of accounts and their balances.
    """
    return [
        {"address": f"0xHolder{i:02X}", "balance": random.uniform(10, 1000)}
        for i in range(5)
    ]

def get_coin_balance_history_by_day(address: str) -> Dict:
    """
    Simulates daily balance snapshots for a given address.
    """
    today = datetime.now()
    return {
        "address": address,
        "history": [
            {
                "date": (today - timedelta(days=i)).strftime('%Y-%m-%d'),
                "balance": round(random.uniform(1.0, 100.0), 2)
            } for i in range(7)
        ]
    }

def get_tokens_list(query: str = "", token_type: str = "erc20") -> List[Dict]:
    """
    Returns token entries based on query and token type.
    """
    sample_tokens = ["TokenA", "TokenB", "TokenC", "TokenD"]
    return [
        {"name": name, "address": f"0x{name.lower()}12345", "type": token_type}
        for name in sample_tokens if query.lower() in name.lower()
    ]