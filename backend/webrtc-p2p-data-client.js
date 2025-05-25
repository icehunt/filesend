// Simple JavaScript client for P2P data transfer using WebRTC

class WebRTCDataClient {
  constructor(signalingServerUrl) {
    this.signalingServerUrl = signalingServerUrl;
    this.wsBaseUrl = signalingServerUrl.replace("http", "ws");
    this.socket = null;
    this.clientId = null;
    this.peerConnections = {}; // Store RTCPeerConnection objects
    this.dataChannels = {}; // Store RTCDataChannel objects

    // Callbacks
    this.onMessageCallback = null;
    this.onPeerConnectedCallback = null;
    this.onPeerDisconnectedCallback = null;
    this.onConnectionStateChangeCallback = null;
  }

  // Set callback for receiving messages
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  // Set callback for peer connection
  onPeerConnected(callback) {
    this.onPeerConnectedCallback = callback;
  }

  // Set callback for peer disconnection
  onPeerDisconnected(callback) {
    this.onPeerDisconnectedCallback = callback;
  }

  // Set callback for connection state changes
  onConnectionStateChange(callback) {
    this.onConnectionStateChangeCallback = callback;
  }

  // Register with signaling server to get a client ID
  async register() {
    const response = await fetch(`${this.signalingServerUrl}/register`);
    const data = await response.json();
    this.clientId = data.client_id;
    return this.clientId;
  }

  // Connect to signaling server
  async connect() {
    if (!this.clientId) {
      await this.register();
    }

    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(`${this.wsBaseUrl}/ws/${this.clientId}`);

      this.socket.onopen = () => {
        console.log("WebSocket connection established");
        this.setupSocketEvents();

        // Request list of connected clients
        this.sendToServer({
          type: "get-clients",
        });

        resolve(this.clientId);
      };

      this.socket.onerror = (error) => {
        console.error("WebSocket connection error:", error);
        reject(error);
      };
    });
  }

  // Setup socket event handlers
  setupSocketEvents() {
    this.socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message);

      switch (message.type) {
        case "offer":
          await this.handleOffer(message);
          break;
        case "answer":
          await this.handleAnswer(message);
          break;
        case "ice-candidate":
          await this.handleIceCandidate(message);
          break;
        case "client-connected":
          console.log(`Client connected: ${message.client_id}`);
          break;
        case "client-disconnected":
          this.handleClientDisconnected(message);
          break;
        case "client-list":
          this.handleClientList(message);
          break;
      }
    };

    this.socket.onclose = () => {
      console.log("WebSocket connection closed");
    };
  }

  // Handle client list received from server
  handleClientList(message) {
    const clients = message.clients;
    console.log("Connected clients:", clients);

    // You could automatically connect to all clients here if desired
    // clients.forEach(clientId => this.connectToPeer(clientId));
  }

  // Create and initialize a new RTCPeerConnection
  createPeerConnection(peerId) {
    const iceServers = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // Add TURN servers for production environments
        // { urls: "turn:your-turn-server.com", username: "username", credential: "credential" }
      ],
    };

    const peerConnection = new RTCPeerConnection(iceServers);
    this.peerConnections[peerId] = peerConnection;

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendToServer({
          type: "ice-candidate",
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          target: peerId,
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);

      if (peerConnection.connectionState === "connected") {
        if (this.onPeerConnectedCallback) {
          this.onPeerConnectedCallback(peerId);
        }
      } else if (
        peerConnection.connectionState === "disconnected" ||
        peerConnection.connectionState === "failed" ||
        peerConnection.connectionState === "closed"
      ) {
        if (this.onPeerDisconnectedCallback) {
          this.onPeerDisconnectedCallback(
            peerId,
            peerConnection.connectionState,
          );
        }
      }

      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(
          peerId,
          peerConnection.connectionState,
        );
      }
    };

    return peerConnection;
  }

  // Create a data channel for sending data
  createDataChannel(peerId, label = "dataChannel") {
    const peerConnection = this.peerConnections[peerId];

    if (!peerConnection) {
      console.error(`No peer connection for ${peerId}`);
      return null;
    }

    const dataChannel = peerConnection.createDataChannel(label, {
      ordered: true, // Guarantee message order
      // You can customize other options:
      // maxRetransmits: 3,      // Max number of retries
      // maxPacketLifeTime: 1000 // Max time in ms to keep retrying
    });

    this.setupDataChannel(peerId, dataChannel);
    this.dataChannels[peerId] = dataChannel;

    return dataChannel;
  }

  // Set up event handlers for a data channel
  setupDataChannel(peerId, dataChannel) {
    dataChannel.onopen = () => {
      console.log(`Data channel with ${peerId} is open`);

      if (this.onPeerConnectedCallback) {
        this.onPeerConnectedCallback(peerId);
      }
    };

    dataChannel.onclose = () => {
      console.log(`Data channel with ${peerId} is closed`);

      if (this.onPeerDisconnectedCallback) {
        this.onPeerDisconnectedCallback(peerId, "datachannel-closed");
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      console.log(`Message from ${peerId}:`, event.data);

      if (this.onMessageCallback) {
        try {
          // Try to parse as JSON, fall back to raw data if not JSON
          let data;
          try {
            data = JSON.parse(event.data);
          } catch (e) {
            data = event.data;
          }

          this.onMessageCallback(peerId, data);
        } catch (error) {
          console.error("Error processing message:", error);
        }
      }
    };
  }

  // Send a message to the signaling server
  sendToServer(message) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not open");
    }
  }

  // Initiate connection to a peer
  async connectToPeer(peerId) {
    if (this.peerConnections[peerId]) {
      console.log(`Already connected to peer ${peerId}`);
      return;
    }

    console.log(`Initiating connection to peer ${peerId}`);

    // Create peer connection
    const peerConnection = this.createPeerConnection(peerId);

    // Create data channel
    this.createDataChannel(peerId);

    // Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    this.sendToServer({
      type: "offer",
      sdp: offer.sdp,
      target: peerId,
    });
  }

  // Handle an incoming WebRTC offer
  async handleOffer(message) {
    const peerId = message.from;
    console.log(`Received offer from ${peerId}`);

    // Create peer connection if it doesn't exist
    if (!this.peerConnections[peerId]) {
      this.createPeerConnection(peerId);
    }

    const peerConnection = this.peerConnections[peerId];

    // Set up data channel handler for when remote peer creates a data channel
    peerConnection.ondatachannel = (event) => {
      console.log(`Received data channel from ${peerId}`);
      const dataChannel = event.channel;
      this.setupDataChannel(peerId, dataChannel);
      this.dataChannels[peerId] = dataChannel;
    };

    // Set remote description
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: message.sdp }),
    );

    // Create answer
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    // Send answer to peer
    this.sendToServer({
      type: "answer",
      sdp: answer.sdp,
      target: peerId,
    });
  }

  // Handle an incoming WebRTC answer
  async handleAnswer(message) {
    const peerId = message.from;
    console.log(`Received answer from ${peerId}`);

    const peerConnection = this.peerConnections[peerId];
    if (peerConnection) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: message.sdp }),
      );
    }
  }

  // Handle an incoming ICE candidate
  async handleIceCandidate(message) {
    const peerId = message.from;
    const peerConnection = this.peerConnections[peerId];

    if (peerConnection) {
      const candidate = new RTCIceCandidate({
        candidate: message.candidate,
        sdpMid: message.sdpMid,
        sdpMLineIndex: message.sdpMLineIndex,
      });

      await peerConnection.addIceCandidate(candidate);
    }
  }

  // Handle a client disconnected notification
  handleClientDisconnected(message) {
    const peerId = message.client_id;
    console.log(`Client disconnected: ${peerId}`);

    this.closePeerConnection(peerId);

    if (this.onPeerDisconnectedCallback) {
      this.onPeerDisconnectedCallback(peerId, "server-notification");
    }
  }

  // Close a specific peer connection
  closePeerConnection(peerId) {
    // Close data channel first
    if (this.dataChannels[peerId]) {
      this.dataChannels[peerId].close();
      delete this.dataChannels[peerId];
    }

    // Then close peer connection
    const peerConnection = this.peerConnections[peerId];
    if (peerConnection) {
      peerConnection.close();
      delete this.peerConnections[peerId];
    }
  }

  // Send data to a specific peer
  sendToPeer(peerId, data) {
    const dataChannel = this.dataChannels[peerId];

    if (!dataChannel || dataChannel.readyState !== "open") {
      console.error(`No open data channel for peer ${peerId}`);
      return false;
    }

    try {
      // Convert data to string if it's an object
      const message = typeof data === "object" ? JSON.stringify(data) : data;
      dataChannel.send(message);
      return true;
    } catch (error) {
      console.error(`Error sending data to peer ${peerId}:`, error);
      return false;
    }
  }

  // Send data to all connected peers
  broadcast(data) {
    const peerIds = Object.keys(this.dataChannels);
    const results = {};

    for (const peerId of peerIds) {
      results[peerId] = this.sendToPeer(peerId, data);
    }

    return results;
  }

  // Get list of connected peers
  getConnectedPeers() {
    return Object.keys(this.dataChannels).filter((peerId) => {
      const dataChannel = this.dataChannels[peerId];
      return dataChannel && dataChannel.readyState === "open";
    });
  }

  // Disconnect from all peers and the signaling server
  disconnect() {
    // Close all data channels and peer connections
    Object.keys(this.peerConnections).forEach((peerId) => {
      this.closePeerConnection(peerId);
    });

    // Close WebSocket
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    console.log("Disconnected from all peers and signaling server");
  }
}

// Example usage:
/*
async function initWebRTC() {
  // Create client and connect to signaling server
  const client = new WebRTCDataClient("http://localhost:8000");
  
  // Set up callbacks
  client.onMessage((peerId, data) => {
    console.log(`Received from ${peerId}:`, data);
    document.getElementById('messages').innerHTML += `<div>From ${peerId}: ${JSON.stringify(data)}</div>`;
  });
  
  client.onPeerConnected((peerId) => {
    console.log(`Connected to peer: ${peerId}`);
    document.getElementById('status').innerHTML += `<div>Connected to: ${peerId}</div>`;
  });
  
  client.onPeerDisconnected((peerId, reason) => {
    console.log(`Disconnected from peer: ${peerId}, reason: ${reason}`);
    document.getElementById('status').innerHTML += `<div>Disconnected from: ${peerId}</div>`;
  });
  
  // Connect to signaling server
  const clientId = await client.connect();
  console.log(`Connected with ID: ${clientId}`);
  document.getElementById('clientId').textContent = clientId;
  
  // Connect to a specific peer
  document.getElementById('connectBtn').addEventListener('click', () => {
    const peerId = document.getElementById('peerId').value;
    if (peerId) {
      client.connectToPeer(peerId);
    }
  });
  
  // Send a message to connected peers
  document.getElementById('sendBtn').addEventListener('click', () => {
    const message = document.getElementById('message').value;
    if (message) {
      const selectedPeer = document.getElementById('selectedPeer').value;
      
      if (selectedPeer === 'all') {
        client.broadcast(message);
      } else {
        client.sendToPeer(selectedPeer, message);
      }
      
      document.getElementById('message').value = '';
    }
  });
  
  // Update peer list dropdown
  setInterval(() => {
    const peers = client.getConnectedPeers();
    const dropdown = document.getElementById('selectedPeer');
    
    // Save current selection
    const currentSelection = dropdown.value;
    
    // Clear dropdown
    dropdown.innerHTML = '<option value="all">All Peers</option>';
    
    // Add peers
    peers.forEach(peerId => {
      const option = document.createElement('option');
      option.value = peerId;
      option.textContent = peerId;
      dropdown.appendChild(option);
    });
    
    // Restore selection if possible
    if (currentSelection && (currentSelection === 'all' || peers.includes(currentSelection))) {
      dropdown.value = currentSelection;
    }
  }, 2000);
  
  return client;
}

// Initialize when page loads
let client;
window.onload = async () => {
  client = await initWebRTC();
};

window.onbeforeunload = () => {
  if (client) {
    client.disconnect();
  }
};
*/
