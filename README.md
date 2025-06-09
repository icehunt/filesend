# FSend2 - WebRTC File Transfer

A secure peer-to-peer file transfer website that uses WebRTC for direct file sharing between devices without uploading files to any server.

## Features

- **Peer-to-peer file transfer**: Files are sent directly between devices using WebRTC
- **No file size limits**: Since files don't go through the server, there are no artificial size restrictions
- **QR code sharing**: Easy sharing via QR code for mobile devices
- **Multiple file support**: Send multiple files in one session
- **Real-time progress**: See upload/download progress in real-time
- **No frameworks**: Pure HTML, CSS, and JavaScript frontend
- **Secure**: Files never touch the server - only WebRTC signaling data is exchanged

## How it works

1. **Receiver** clicks "Receive Files" on the landing page
2. Frontend creates a WebRTC offer and sends it to the backend
3. Backend responds with a UUID and generates a QR code
4. **Sender** scans the QR code or visits the link
5. Sender's page gets the WebRTC offer from the backend
6. Sender creates a WebRTC answer and sends it back to the backend
7. Receiver polls for the answer and establishes the WebRTC connection
8. Files are transferred directly between the two devices via WebRTC data channels

## Installation

1. Clone or download this repository
2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python run.py
```

Or alternatively, run the FastAPI server directly:
```bash
python src/server.py
```

Or using uvicorn:
```bash
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
```

4. Open your browser and go to `http://localhost:8000`

## Quick Test

To test the application locally:

1. Start the server: `python run.py`
2. Open `http://localhost:8000` in one browser tab
3. Click "Receive Files" 
4. Copy the generated link and open it in another tab (or scan QR with mobile)
5. Select files in the sender tab and click "Send Files"
6. Files should transfer directly and be downloadable in the receiver tab

## Usage

### To Receive Files:
1. Go to `http://localhost:8000`
2. Click "Receive Files"
3. Share the QR code or link with the sender
4. Wait for files to be sent

### To Send Files:
1. Scan the QR code or visit the shared link
2. Wait for connection to establish
3. Drag and drop files or click to select them
4. Click "Send Files"

## Technical Details

### Backend (FastAPI)
- Handles WebRTC signaling (offer/answer exchange)
- Generates QR codes for easy sharing
- Stores session data temporarily in memory
- Serves static HTML files

### Frontend (Vanilla JavaScript)
- **Landing page**: Creates WebRTC offers and displays QR codes
- **Upload page**: Handles file selection and WebRTC data channel communication
- **WebRTC**: Uses STUN servers for NAT traversal
- **File transfer**: Chunks files into 16KB pieces for reliable transfer

### File Transfer Protocol
Files are sent as JSON messages over WebRTC data channels:
- `file-start`: Indicates the beginning of a file transfer with metadata
- `file-chunk`: Contains base64-encoded file data chunks
- `file-end`: Indicates the end of a file transfer

## Security Considerations

- Files are transferred directly between devices (peer-to-peer)
- The server only handles WebRTC signaling data
- No file content is stored on the server
- Sessions are temporary and stored in memory only
- Uses STUN servers for NAT traversal (standard WebRTC practice)

## Limitations

- Both devices need to be online simultaneously
- May not work behind certain corporate firewalls or NATs
- Session data is stored in memory (lost on server restart)
- No authentication or access control

## Future Improvements

- Add TURN server support for better NAT traversal
- Implement session persistence with a database
- Add password protection for sessions
- Support for resuming interrupted transfers
- File compression options
- Better error handling and retry mechanisms

## License

MIT License

