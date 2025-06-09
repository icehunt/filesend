from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel
import uuid

# import qrcode
import io
import base64
from typing import Dict, Optional
import json

app = FastAPI()

# Store WebRTC offers temporarily
offers_store: Dict[str, dict] = {}


class WebRTCOffer(BaseModel):
    offer: dict


class WebRTCAnswer(BaseModel):
    answer: dict


# Serve static files
app.mount("/static", StaticFiles(directory="public"), name="static")


@app.get("/", response_class=HTMLResponse)
async def read_root():
    with open("public/index.html", "r") as f:
        return HTMLResponse(content=f.read())


@app.get("/upload/{session_id}", response_class=HTMLResponse)
async def upload_page(session_id: str):
    with open("public/upload.html", "r") as f:
        content = f.read()
        # Replace placeholder with actual session ID
        content = content.replace("{{SESSION_ID}}", session_id)
        return HTMLResponse(content=content)


@app.post("/api/create-session")
async def create_session(offer: WebRTCOffer):
    """Create a new session with WebRTC offer and return UUID + QR code"""
    session_id = str(uuid.uuid4())

    # Store the offer
    offers_store[session_id] = {
        "offer": offer.offer,
        "answer": None,
        "created_at": None,
    }

    # Generate QR code
    upload_url = f"https://filesend.rs/upload/{session_id}"
    # qr = qrcode.QRCode(version=1, box_size=10, border=5)
    # qr.add_data(upload_url)
    # qr.make(fit=True)

    # Convert QR code to base64 image
    # img = qr.make_image(fill_color="black", back_color="white")
    # img_buffer = io.BytesIO()
    # img.save(img_buffer, format='PNG')
    # img_str = base64.b64encode(img_buffer.getvalue()).decode()

    return {
        "session_id": session_id,
        "upload_url": upload_url,
        #  "qr_code": f"data:image/png;base64,{img_str}"
    }


@app.get("/api/session/{session_id}/offer")
async def get_offer(session_id: str):
    """Get the WebRTC offer for a session"""
    if session_id not in offers_store:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"offer": offers_store[session_id]["offer"]}


@app.post("/api/session/{session_id}/answer")
async def set_answer(session_id: str, answer: WebRTCAnswer):
    """Set the WebRTC answer for a session"""
    if session_id not in offers_store:
        raise HTTPException(status_code=404, detail="Session not found")

    offers_store[session_id]["answer"] = answer.answer
    return {"status": "success"}


@app.get("/api/session/{session_id}/answer")
async def get_answer(session_id: str):
    """Get the WebRTC answer for a session"""
    if session_id not in offers_store:
        raise HTTPException(status_code=404, detail="Session not found")

    answer = offers_store[session_id]["answer"]
    if answer is None:
        raise HTTPException(status_code=404, detail="Answer not yet available")

    return {"answer": answer}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
