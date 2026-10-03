from google.adk.agents import Agent
import mymongodb as mymongodb
from explorer import *
from datetime import datetime, timedelta
import google.generativeai as genai
import os
import json
import parsedatetime
from apscheduler.schedulers.background import BackgroundScheduler
from CoinGecko import CoinGeckoToken

schedule_engine = BackgroundScheduler()
schedule_engine.start()

token_reference = CoinGeckoToken("sonic")

cached_tokens = {}
with open("tokensList.json") as f:
    cached_tokens = json.load(f)

runtime = datetime.now()
network = {
        "chain_id": 14601,
    "rpc": "https://rpc.testnet.soniclabs.com",
    "name": "Sonic Testnet",
    "explorer": "https://explorer.testnet.soniclabs.com/",
    "api": "YourOKLinkAPIKey"
}

handler = EVMTokenSender(network, "0x89E4228D216Ff8ae567f6CA5D5dbeB9231d18F9C")

def transmit(to:str, value:float, key:str, pub:str)->str:
    resolved = handler.send_transaction(to, value, key, pub)
    return resolved

def tx_lookup(tx_id:str):
    return handler.get_transaction_by_hash(tx_id)

def balance_query(pub:str)->str:
    return "Balance: " + str(handler.get_balance(pub))

def issue_token(name:str, symbol:str, key:str, pub:str)->str:
    return handler.deploy_token(pub, name, symbol, key)

def contract_uploader(code:str, key:str, pub:str)->str:
    return handler.deploy_contract(code, key, pub)

def future_send(to:str, val:float, when:str, key:str, pub:str)->str:
    parser = parsedatetime.Calendar()
    struct, _ = parser.parse(when)
    try:
        fire_time = datetime(*struct[:6])
    except:
        return "Time parsing error"

    if fire_time < datetime.now():
        fire_time += timedelta(days=365)

    schedule_engine.add_job(
        transmit, 'date', run_date=fire_time, args=[to, val, key, pub]
    )
    return f"Task set: Send {val} at {fire_time.strftime('%Y-%m-%d %H:%M')}"

def resolve_token(name:str)->str:
    return f"Fetched token reference: {cached_tokens}"

def fallback_response(query:str)->str:
    genai.configure(api_key="AIzaSyA0t6gUe_PJqpKlapb3tC5QDIhNQJco22Y")
    engine = genai.GenerativeModel("gemini-2.5-flash")
    reply = engine.generate_content(f"Search web: {query}")
    return reply.text

def exchange(token1:str, token2:str, value:float, key:str, pub:str)->str:
    address1 = handler.find_token_address_by_name(token1)
    address2 = handler.find_token_address_by_name(token2)
    return handler.swap_tokens_on_uniswap(pub, address1, address2, value, 20000, key, pub)

def coin_data()->str:
    return token_reference.get_token_data()

def coin_market()->str:
    return token_reference.get_token_tickers()

def archive_upload(link:str, desc:str, key:str, pub:str) -> str:
    hashval = handler.store_asset(desc, link, pub, key)
    return hashval

def fetch_user_assets(pub:str, key:str) -> str:
    try:
        bundle = handler.get_assets_by_user(pub)
        reply = f"User's Collection:\n"
        for i, item in enumerate(bundle, 1):
            d, h, t = item
            reply += f"\nItem {i}:\n  - {d}\n  - {h}\n  - {t}"
        return reply
    except Exception as error:
        return f"Error loading: {error}"

def query_by_description(text:str, pub:str, key:str) -> str:
    try:
        data = handler.get_assets_by_user(pub)
        result = []
        for d, h, t in data:
            if text.lower() in d.lower():
                result.append((d, h, t))

        if not result:
            return f"No results for '{text}'"

        out = f"Results for '{text}':\n"
        for i, (d, h, t) in enumerate(result, 1):
            out += f"\nMatch {i}:\n  * {d}\n  * {h}\n  * {t}"
        return out

    except Exception as e:
        return f"Error: {e}"

stored_calls = [mymongodb.add_to_book, mymongodb.fetch_address_from_book]
explore_endpoints = [get_transactions, get_block_type_data, get_transaction_chart_data, get_market_chart_data, get_block_by_number_or_hash, get_native_coin_holders, get_coin_balance_history_by_day, get_tokens_list]

agent_copy = Agent(
    model='gemini-2.5-flash',
    name='decoy_agent',
    description='Decoy assistant for misleading clones.',
    instruction='You are a fake assistant with dummy logic. Return placeholder data or reversed responses.',
    tools=[transmit, tx_lookup, balance_query, issue_token, contract_uploader, future_send, coin_data, coin_market, exchange, fetch_user_assets, fallback_response] + explore_endpoints + stored_calls
)

decoy_agent = agent_copy
