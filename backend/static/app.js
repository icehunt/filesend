let peerConnection;
let dataChannel;
let fileReader;
let receivedBuffers = [];
let receivedSize = 0;
let fileName = "";
let fileSize = 0;
let sessionId = "";
const CHUNK_SIZE = 16384;

const fileInput = document.getElementById("fileInput");
const status = document.getElementById("status");
const progress = document.getElementById("progress");
const pcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Initialize WebRTC
function initPeerConnection() {
  peerConnection = new RTCPeerConnection(pcConfig);
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(
        JSON.stringify({
          type: "candidate",
          candidate: event.candidate,
          target_id: targetId,
        }),
      );
    }
  };
  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };
}

// Setup data channel
function setupDataChannel() {
  dataChannel.onopen = () => {
    status.textContent = "Status: Data channel open";
  };
  dataChannel.onclose = () => {
    status.textContent = "Status: Data channel closed";
  };
  dataChannel.onmessage = handleMessage;
}

// Handle incoming messages
function handleMessage(event) {
  if (typeof event.data === "string") {
    const metadata = JSON.parse(event.data);
    fileName = metadata.name;
    fileSize = metadata.size;
    status.textContent = `Status: Receiving ${fileName}`;
  } else {
    receivedBuffers.push(event.data);
    receivedSize += event.data.byteLength;
    progress.value = (receivedSize / fileSize) * 100;
    if (receivedSize === fileSize) {
      const received = new Blob(receivedBuffers);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(received);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
      resetReceiver();
    }
  }
}

// Reset receiver state
function resetReceiver() {
  receivedBuffers = [];
  receivedSize = 0;
  fileName = "";
  fileSize = 0;
  progress.value = 0;
  progress.style.display = "none";
}

// Send file
function sendFile(file) {
  status.textContent = `Status: Sending ${file.name}`;
  progress.style.display = "block";
  fileReader = new FileReader();
  let offset = 0;
  dataChannel.send(JSON.stringify({ name: file.name, size: file.size }));
  function readSlice() {
    const slice = file.slice(offset, offset + CHUNK_SIZE);
    fileReader.onload = (e) => {
      dataChannel.send(e.target.result);
      offset += e.target.result.byteLength;
      progress.value = (offset / file.size) * 100;
      if (offset < file.size) {
        readSlice();
      } else {
        status.textContent = "Status: File sent";
        progress.style.display = "none";
      }
    };
    fileReader.readAsArrayBuffer(slice);
  }
  readSlice();
}

// Start transfer
window.startTransfer = function () {
  const file = fileInput.files[0];
  if (!file) {
    alert("Please select a file");
    return;
  }
  if (!dataChannel || dataChannel.readyState !== "open") {
    alert("Connection not established");
    return;
  }
  sendFile(file);
};

// WebSocket connection
const ws = new WebSocket("ws://localhost:8080/ws");
let targetId = "";

ws.onopen = () => {
  console.log("making connection");
  initPeerConnection();
  dataChannel = peerConnection.createDataChannel("fileTransfer");
  setupDataChannel();
  peerConnection
    .createOffer()
    .then((offer) => {
      return peerConnection.setLocalDescription(offer);
    })
    .then(() => {
      ws.send(
        JSON.stringify({
          type: "offer",
          sdp: peerConnection.localDescription.sdp,
        }),
      );
    })
    .catch((error) => {
      console.error("Error creating offer:", error);
    });
  console.log("done making connection");
};

ws.onmessage = async (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "id") {
    sessionId = message.id;
    // Generate QR code
    const qrUrl = `${window.location.origin}/upload?session_id=${sessionId}`;
    new QRCode(document.getElementById("qrcode"), {
      text: qrUrl,
      width: 128,
      height: 128,
    });
    status.textContent = "Status: Waiting for peer";
  } else if (message.type === "answer") {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message),
    );
    targetId = message.sender_id; // Store target for ICE candidates
  } else if (message.type === "candidate") {
    await peerConnection.addIceCandidate(
      new RTCIceCandidate(message.candidate),
    );
  }
};
