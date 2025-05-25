let peerConnection;
let dataChannel;
let fileReader;
let receivedBuffers = [];
let receivedSize = 0;
let fileName = "";
let fileSize = 0;
const CHUNK_SIZE = 16384;

const fileInput = document.getElementById("fileInput");
const status = document.getElementById("status");
const progress = document.getElementById("progress");
const pcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// Get session ID from URL
const urlParams = new URLSearchParams(window.location.search);
const targetId = urlParams.get("session_id");

// Initialize WebRTC
function initPeerConnection() {
  peerConnection = new RTCPeerConnection();
  console.log("candidate");
  peerConnection.onicecandidate = (event) => {
    console.log("ice");
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
    console.log("data");
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
    alert("Please select a files");
    return;
  }
  if (!dataChannel || dataChannel.readyState !== "open") {
    alert("Connection not established");
    return;
  }
  sendFile(file);
};

// WebSocket connection
const ws = new WebSocket(`ws://localhost:8080/ws?session_id=${targetId}`);
// console.log("Target ID:", targetId); // Debug

ws.onopen = () => {
  console.log("init");
  initPeerConnection();
};

ws.onmessage = async (event) => {
  const message = JSON.parse(event.data);
  if (message.type === "id") {
    // Store own session ID
    const sessionId = message.id;
  } else if (message.type === "offer") {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message),
    );
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(
      JSON.stringify({
        type: "answer",
        sdp: answer.sdp,
        sender_id: sessionId,
        target_id: targetId,
      }),
    );
  } else if (message.type === "candidate") {
    await peerConnection.addIceCandidate(
      new RTCIceCandidate(message.candidate),
    );
  }
};
