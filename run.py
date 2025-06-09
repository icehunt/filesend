#!/usr/bin/env python3
"""
FSend2 - WebRTC File Transfer Application
Simple startup script for the file transfer website
"""

import uvicorn
import sys
import os

# Add src directory to path so we can import the server module
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

if __name__ == "__main__":
    print("🚀 Starting FSend2 File Transfer Server...")
    print("📁 Open your browser and go to: http://localhost:8000")
    print("🔄 Press Ctrl+C to stop the server")
    print("-" * 50)
    
    try:
        uvicorn.run(
            "server:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n👋 Server stopped. Goodbye!")

