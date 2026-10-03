import requests
from typing import Dict, Any

class CoinGeckoToken:
    BASE_URL = "https://api.coingecko.com/api/v3"

    def __init__(self, token_id: str):
        self.token_id = token_id

    def get_token_data(self) -> Dict[str, Any]:
        """
        Returns basic fake token data for testing/demo purposes.
        Simulates a CoinGecko API call response.
        """
        return {
            "id": self.token_id,
            "symbol": "fake",
            "name": "Fake Token",
            "market_data": {
                "current_price": {"usd": 0.0},
                "market_cap": {"usd": 0},
                "total_volume": {"usd": 0}
            }
        }

    def get_token_tickers(self) -> Dict[str, Any]:
        """
        Returns dummy tickers info as a placeholder.
        This should be used for front-end or logic mock-ups.
        """
        return {
            "tickers": [
                {
                    "base": "FAKE",
                    "target": "USD",
                    "market": {"name": "MockExchange"},
                    "last": 0.0,
                    "volume": 0.0
                }
            ]
        }
