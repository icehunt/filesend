import uuid
from typing import Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Initialize FastAPI app
app = FastAPI(title="WebRTC P2P Signaling Server")

# Add CORS support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Models for request and response data
class ClientInfo(BaseModel):
    client_id: str
    peer_id: str = None

class Offer(BaseModel):
    sdp: str
    target: str

class Answer(BaseModel):
    sdp: str
    target: str

class IceCandidate(BaseModel):
    candidate: str
    sdpMid: str
    sdpMLineIndex: int
    target: str

# In-memory data storage
connected_clients: Dict[str, WebSocket] = {}

# Routes
@app.get("/")
async def root():
    return {"message": "WebRTC Signaling Server is running"}

@app.post("/create-room")
async def create_room():
    """Create a new room with a unique ID"""
    room_id = str(uuid.uuid4())
    rooms[room_id] = Room(room_id=room_id)
    return {"room_id": room_id}

@app.get("/rooms")
async def get_rooms():
    """List all available rooms"""
    return {"rooms": [{"room_id": room_id, "client_count": len(room.clients)} for room_id, room in rooms.items()]}

@app.post("/join-room/{room_id}")
async def join_room(room_id: str):
    """Join an existing room by ID"""
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
    
    client_id = str(uuid.uuid4())
    rooms[room_id].clients.add(client_id)
    
    return {"client_id": client_id, "room_id": room_id}

@app.post("/leave-room/{room_id}/{client_id}")
async def leave_room(room_id: str, client_id: str):
    """Leave a room"""
    if room_id not in rooms:
        raise HTTPException(status_code=404, detail=f"Room {room_id} not found")
    
    if client_id in rooms[room_id].clients:
        rooms[room_id].clients.remove(client_id)
        
        # Clean up empty rooms
        if not rooms[room_id].clients:
            del rooms[room_id]
            
    return {"success": True}

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """WebSocket connection for real-time signaling"""
    await websocket.accept()
    connected_clients[client_id] = websocket
    
    # Notify all other connected clients about the new connection
    for cid, ws in connected_clients.items():
        if cid != client_id:
            await ws.send_json({
                "type": "client-connected",
                "client_id": client_id
            })
    
    try:
        while True:
            # Wait for messages from the client
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "offer":
                # Handle WebRTC offer
                target = data.get("target")
                sdp = data.get("sdp")
                
                if target in connected_clients:
                    await connected_clients[target].send_json({
                        "type": "offer",
                        "sdp": sdp,
                        "from": client_id
                    })
                
            elif message_type == "answer":
                # Handle WebRTC answer
                target = data.get("target")
                sdp = data.get("sdp")
                
                if target in connected_clients:
                    await connected_clients[target].send_json({
                        "type": "answer",
                        "sdp": sdp,
                        "from": client_id
                    })
                    
            elif message_type == "ice-candidate":
                # Handle ICE candidate
                target = data.get("target")
                candidate = data.get("candidate")
                sdpMid = data.get("sdpMid")
                sdpMLineIndex = data.get("sdpMLineIndex")
                
                if target in connected_clients:
                    await connected_clients[target].send_json({
                        "type": "ice-candidate",
                        "candidate": candidate,
                        "sdpMid": sdpMid,
                        "sdpMLineIndex": sdpMLineIndex,
                        "from": client_id
                    })
                    
            elif message_type == "get-clients":
                # Send list of all other connected clients
                other_clients = [cid for cid in connected_clients.keys() if cid != client_id]
                await websocket.send_json({
                    "type": "client-list",
                    "clients": other_clients
                })
                    
    except WebSocketDisconnect:
        # Handle client disconnection
        if client_id in connected_clients:
            del connected_clients[client_id]
            
        # Notify all other clients about disconnection
        for cid, ws in connected_clients.items():
            await ws.send_json({
                "type": "client-disconnected",
                "client_id": client_id
            })
rooms = get_rooms()
# Run the server with Uvicorn
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
