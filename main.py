import os
import re
import datetime
from fastapi import FastAPI, HTTPException, status
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pymongo import MongoClient, DESCENDING
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId

# Load environment variables from .env file
load_dotenv()

# --- Initialize Application and Services ---
app = FastAPI()

# --- Mount static files directory ---
app.mount("/static", StaticFiles(directory="static"), name="static")


# --- Pydantic Models ---
class RequestItem(BaseModel):
    item_description: str
    item_brand: Optional[str] = None
    supplier: Optional[str] = None
    unit_cost: float
    quantity: int

class ReplenishmentRequest(BaseModel):
    id: str = Field(alias='_id')
    control_number: str
    request_date: datetime.datetime
    items: List[RequestItem]
    last_edited: Optional[datetime.datetime] = None
    status: str = "active" 
    deleted_date: Optional[datetime.datetime] = None 

    class Config:
        from_attributes = True
        populate_by_name = True
        json_encoders = {ObjectId: str}


class SupplyItem(BaseModel):
    supplier: Optional[str] = None
    item_description: Optional[str] = None
    item_brand: Optional[str] = None
    unit_cost: Optional[float] = 0.0 
    
    class Config:
        from_attributes = True


# --- Add CORS Middleware ---
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database Connection ---
try:
    client = MongoClient(os.getenv("MONGO_URI"))
    db = client[os.getenv("MONGO_DB", "replenishment_system")]
    supplies_collection = db[os.getenv("MONGO_SUPPLIES_COLLECTION", "md_list")]
    requests_collection = db[os.getenv("MONGO_REQUESTS_COLLECTION", "requests")]
    print("Successfully connected to MongoDB.")
except Exception as e:
    print(f"Failed to connect to MongoDB: {e}")


# --- Helper Function to Generate Control Number ---
def get_next_control_number():
    now = datetime.datetime.now()
    year_str = now.strftime("%y")
    month_str = now.strftime("%m")
    prefix = f"CREQ-{year_str}{month_str}"
    
    last_request = requests_collection.find_one(
        {"control_number": {"$regex": f"^{prefix}"}},
        sort=[("control_number", DESCENDING)]
    )
    
    if last_request:
        last_series_str = last_request["control_number"][len(prefix):]
        last_series = int(last_series_str)
        new_series = last_series + 1
    else:
        new_series = 1
        
    return f"{prefix}{str(new_series).zfill(3)}"


# --- API Endpoints ---

@app.get("/", response_class=FileResponse)
async def read_index():
    return "index.html"

@app.get("/dashboard/top-items")
def get_top_items():
    now = datetime.datetime.now(datetime.timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    pipeline = [
        {"$match": {"request_date": {"$gte": start_of_month}, "status": "active"}},
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.item_description", "request_count": {"$sum": 1}}},
        {"$sort": {"request_count": -1}},
        {"$limit": 10},
        {"$project": {"_id": 0, "item_description": "$_id", "request_count": "$request_count"}}
    ]
    
    try:
        return list(requests_collection.aggregate(pipeline))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dashboard data: {e}")

@app.get("/dashboard/request-frequency")
def get_request_frequency():
    today = datetime.datetime.now(datetime.timezone.utc)
    thirty_days_ago = today - datetime.timedelta(days=30)

    pipeline = [
        {"$match": {"request_date": {"$gte": thirty_days_ago}}},
        {
            "$project": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$request_date"}},
                "item_count": {"$size": "$items"}
            }
        },
        {
            "$group": {
                "_id": "$date",
                "request_count": {"$sum": 1},
                "total_items": {"$sum": "$item_count"}
            }
        },
        {"$sort": {"_id": 1}},
        {
            "$project": {
                "_id": 0,
                "date": "$_id",
                "request_count": "$request_count",
                "item_count": "$total_items"
            }
        }
    ]
    try:
        return list(requests_collection.aggregate(pipeline))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch frequency data: {e}")


@app.get("/keyword-search", response_model=List[SupplyItem])
def keyword_search(query: str):
    if not query: return []
    try:
        words = query.split()
        and_conditions = []
        for word in words:
            safe_word = re.escape(word)
            regex_pattern = re.compile(safe_word, re.IGNORECASE)
            word_condition = {"$or": [{"item_description": {"$regex": regex_pattern}}, {"supplier": {"$regex": regex_pattern}}]}
            and_conditions.append(word_condition)

        mongo_query = {"$and": and_conditions} if and_conditions else {}
        results_from_db = list(supplies_collection.find(mongo_query, limit=50))
        
        final_results = []
        for item in results_from_db:
            cost_raw = item.get("unit_cost", "0")
            item['unit_cost'] = float(str(cost_raw).replace(",", "")) if isinstance(cost_raw, (str, int, float)) else 0.0
            for key in ['supplier', 'item_description', 'item_brand']:
                if isinstance(item.get(key), str):
                    item[key] = item[key].encode('ascii', 'ignore').decode('utf-8').replace("'", "`")
            final_results.append(item)
        return final_results
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to perform keyword search: {e}")


@app.post("/requests", response_model=ReplenishmentRequest)
def create_replenishment_request(items: List[RequestItem]):
    if not items: raise HTTPException(status_code=400, detail="Request items cannot be empty.")
    try:
        control_number = get_next_control_number()
        new_request_doc = {
            "control_number": control_number,
            "request_date": datetime.datetime.now(datetime.timezone.utc),
            "items": [item.model_dump() for item in items],
            "last_edited": None,
            "status": "active"
        }
        result = requests_collection.insert_one(new_request_doc)
        created_request = requests_collection.find_one({"_id": result.inserted_id})
        created_request['_id'] = str(created_request['_id'])
        return created_request
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save replenishment request: {e}")


@app.get("/requests", response_model=List[ReplenishmentRequest])
def get_all_requests():
    try:
        cursor = requests_collection.find({}, sort=[("request_date", DESCENDING)])
        return [dict(req, _id=str(req['_id'])) for req in cursor]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch replenishment requests: {e}")

@app.put("/requests/{control_number}", response_model=ReplenishmentRequest)
def update_replenishment_request(control_number: str, items: List[RequestItem]):
    if not items: raise HTTPException(status_code=400, detail="Request items cannot be empty.")
    try:
        update_data = {
            "$set": {"items": [item.model_dump() for item in items], "last_edited": datetime.datetime.now(datetime.timezone.utc)}
        }
        result = requests_collection.find_one_and_update(
            {"control_number": control_number, "status": "active"},
            update_data,
            return_document=True
        )
        if result is None: raise HTTPException(status_code=404, detail=f"Active request with control number {control_number} not found.")
        result['_id'] = str(result['_id'])
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update replenishment request: {e}")

@app.delete("/requests/{control_number}", status_code=status.HTTP_200_OK)
def delete_replenishment_request(control_number: str):
    try:
        result = requests_collection.update_one(
            {"control_number": control_number},
            {"$set": {"status": "deleted", "deleted_date": datetime.datetime.now(datetime.timezone.utc)}}
        )
        if result.matched_count == 0: raise HTTPException(status_code=404, detail=f"Request with control number {control_number} not found.")
        return {"status": "success", "message": f"Request {control_number} has been deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"A database error occurred during the delete operation: {e}")
