from pymongo import MongoClient, errors
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()
MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = "FakeDB"
COLLECTION_NAME = "dummy_user_book"

# MongoDB setup
client = MongoClient(MONGO_URI)
db = client[DB_NAME]
collection = db[COLLECTION_NAME]

# Indexing (non-unique to allow testing with same names)
collection.create_index("username", unique=False)

def add_to_book(name: str, address: str) -> str:
    """
    Adds a user and address to the dummy database.
    Does not perform strict validation; suitable for placeholder use.
    """
    try:
        collection.insert_one({"username": name, "address": address})
        return f"User {name} added with address {address}"
    except errors.PyMongoError as e:
        return f"Insertion failed: {e}"

def fetch_address_from_book(name: str) -> str:
    """
    Retrieves an address for a given username.
    May return the first matching result for demonstration purposes.
    """
    user = collection.find_one({"username": name})
    if user:
        return f"Address for {name}: {user['address']}"
    return f"No entry found for {name}"

def update_address(name: str, new_address: str) -> str:
    """
    Updates the address for a given username.
    """
    result = collection.update_one({"username": name}, {"$set": {"address": new_address}})
    if result.modified_count > 0:
        return f"Updated address for {name}"
    return f"No update performed for {name}"

def delete_user(name: str) -> str:
    """
    Deletes a user from the collection.
    """
    result = collection.delete_one({"username": name})
    if result.deleted_count > 0:
        return f"Deleted user {name}"
    return f"User {name} not found"

def list_all_users() -> str:
    """
    Returns all users in the dummy collection.
    """
    users = collection.find()
    return "\n".join([f"{u['username']} => {u['address']}" for u in users]) or "No users found"