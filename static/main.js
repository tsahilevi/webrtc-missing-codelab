// Audio and video muting.
const audioBtn = document.getElementById('audioBtn');
audioBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack.enabled) {
        audioBtn.classList.add('muted');
    } else {
        audioBtn.classList.remove('muted');
    }
    audioTrack.enabled = !audioTrack.enabled;
});
const videoBtn = document.getElementById('videoBtn');
videoBtn.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack.enabled) {
        videoBtn.classList.add('muted');
    } else {
        videoBtn.classList.remove('muted');
    }
    videoTrack.enabled = !videoTrack.enabled;
    // The advanced version of this stops the track to disable and uses
    // replaceTrack to re-enable. Not necessary in Firefox which turns
    // off the camera light.
});

// Relatively self-contained screensharing/replaceTrack example.
let screenShare;
function replaceVideoTrack(withTrack) {
    peers.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(withTrack);
        }
    });
}
const shareBtn = document.getElementById('shareBtn');
shareBtn.addEventListener('click', async () => {
    if (screenShare) { // click-to-end.
        screenShare.getTracks().forEach(t => t.stop());
        screenShare = null;
        document.getElementById('localVideo').srcObject = localStream;
        replaceVideoTrack(localStream.getVideoTracks()[0]);
        shareBtn.classList.remove('sharing');
        return;
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({video: true});
    const track = stream.getVideoTracks()[0];
    replaceVideoTrack(track);
    document.getElementById('localVideo').srcObject = stream;
    track.addEventListener('ended', () => {
        console.log('Screensharing ended via the browser UI');
        screenShare = null;
        document.getElementById('localVideo').srcObject = localStream;
        replaceVideoTrack(localStream.getVideoTracks()[0]);
        shareBtn.classList.remove('sharing');
    });
    screenShare = stream;
    shareBtn.classList.add('sharing');
});

// When clicking the hangup button, any connections will be closed.
const hangupBtn = document.getElementById('hangupButton');
hangupBtn.addEventListener('click', () => {
    hangupBtn.disabled = true;
    peers.forEach((pc, id) => {
        hangup(id);
    });
});

// Change the video bandwidth for all peers.
const bandwidthSelector = document.querySelector('select#bandwidth');
bandwidthSelector.onchange = () => {
    bandwidthSelector.disabled = true;
    const bandwidth = bandwidthSelector.options[bandwidthSelector.selectedIndex].value;
    if (!('RTCRtpSender' in window && 'setParameters' in window.RTCRtpSender.prototype)) {
        return; // Not supported.
    }
    peers.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!sender) {
            return;
        }
        const parameters = sender.getParameters();
        if (!parameters.encodings) { // Firefox workaround.
          parameters.encodings = [{}];
        }

        if (bandwidth === 'unlimited') {
          delete parameters.encodings[0].maxBitrate;
        } else {
          parameters.encodings[0].maxBitrate = bandwidth * 1000;
        }
        sender.setParameters(parameters)
            .then(() => {
              bandwidthSelector.disabled = false;
            })
            .catch(e => console.error(e));
    });
}

// We connect to the same server and same protocol. Note that in production
// you will end up connecting to wss (secure websockets) all the time.
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const peers = new Map(); // A map of all peer ids to their peerconnections.
let clientId; // our client id.
let ws; // our websocket.
let localStream; // local stream to be acquired from getUserMedia.
let iceServers = null; // the latest iceServers we got from the signaling server.

async function getUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    document.getElementById('localVideo').srcObject = stream;
    return stream;
}

// Connect the websocket and listen for messages.
function connect() {
    return new Promise((resolve, reject) => {
        ws = new WebSocket(protocol + '://' + window.location.host);
        ws.addEventListener('open', () => {
            // wait until we have received the iceServers message.
            // resolve();
            console.log('websocket opened');
        });
        ws.addEventListener('error', (e) => {
            console.log('websocket error, is the server running?', e);
            reject(e);
        });
        ws.addEventListener('close', (e) => {
            console.log('websocket closed', e);
        });
        ws.addEventListener('message', async (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch(err) {
                console.log('Received invalid JSON', err, e.data);
                return;
            }
            switch(data.type) {
            case 'hello':
                clientId = data.id;
                document.getElementById('clientId').innerText = clientId;
                // Set the url hash (#) to the client id. This allows simple copy-paste
                // of the url to another tab.
                window.location.hash = clientId;
                break;
            case 'iceServers':
                iceServers = data.iceServers;
                resolve(); // resolve the promise only now so we always have an ice server configuration
                break;
            case 'bye':
                if (peers.has(data.id)) {
                    peers.get(data.id).close();
                    peers.delete(data.id);
                } else {
                    console.log('Peer not found', data.id);
                }
                break;
            case 'offer':
                if (!peers.has(data.id)) {
                    console.log('Incoming call from', data.id);
                    document.getElementById('peerId').innerText = data.id;
                    if (peers.size >= 1) { // Already in a call. Reject.
                        console.log('Already in a call, rejecting');
                        ws.send(JSON.stringify({
                            type: 'bye',
                            id: data.id,
                        }));
                        return;
                    }
                    // Create a new peer.
                    const pc = createPeerConnection(data.id);
                    if (localStream) {
                        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
                    }
                    await pc.setRemoteDescription({
                        type: data.type,
                        sdp: data.sdp
                    });
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    ws.send(JSON.stringify({
                        type: 'answer',
                        sdp: answer.sdp,
                        id: data.id,
                    }));
                    hangupBtn.disabled = false;
                } else {
                    console.log('Subsequent offer not implemented');
                }
                break;
            case 'answer':
                if (peers.has(data.id)) {
                    const pc = peers.get(data.id);
                    await pc.setRemoteDescription({
                        type: data.type,
                        sdp: data.sdp
                    });
                } else {
                    console.log('Peer not found', data.id);
                }
                break;
            case 'candidate':
                if (peers.has(data.id)) {
                    const pc = peers.get(data.id);
                    console.log('addIceCandidate', data);
                    await pc.addIceCandidate(data.candidate);
                } else {
                    console.log('Peer not found', data.id);
                }
                break;
            default:
                console.log('Unhandled', data);
                break;
            }
        });
    });
}

// Helper function to create a peerconnection and set up a couple of useful
// event listeners.
function createPeerConnection(id) {
    const pc = new RTCPeerConnection({iceServers});
    pc.addEventListener('icecandidate', (e) => {
        const {candidate} = e;
        /*
         * the following code block demonstrates a failure to connect.
         * Do not use in production.
        if (candidate && candidate.candidate !== '') {
            const parts = candidate.candidate.split(' ');
            parts[5] = 10000; // replace port with 10000 to make ice fail.
            ws.send(JSON.stringify({
                type: 'candidate',
                candidate: {
                    candidate: parts.join(' '),
                    sdpMid: candidate.sdpMid,
                    sdpMLineIndex: candidate.sdpMLineIndex,
                },
                id,
            }));
            return;
        }
        */
        ws.send(JSON.stringify({
            type: 'candidate',
            candidate,
            id,
        }));
    });
    pc.addEventListener('track', (e) => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.onloadedmetadata = () => {
            // called when the first frame is rendered.
            console.log(id, 'loaded metadata');
        };
        remoteVideo.srcObject = e.streams[0];
    });
    pc.addEventListener('iceconnectionstatechange', () => {
        console.log(id, 'iceconnectionstatechange', pc.iceConnectionState);
    });
    pc.addEventListener('connectionstatechange', () => {
        console.log(id, 'connectionstatechange', pc.connectionState);
        if (pc.connectionState === 'connected') {
            hangupBtn.disabled = false;
            pc.getStats().then(onConnectionStats);
        }
    });
    pc.addEventListener('signalingstatechange', () => {
        console.log(id, 'signalingstatechange', pc.signalingState);
    });

    let lastResult = null; // the last getStats result.
    const intervalId = setInterval(async () => {
        if (pc.signalingState === 'closed') {
            clearInterval(intervalId);
            return;
        }
        lastResult = await queryBitrateStats(pc, lastResult);
    }, 2000);
    peers.set(id, pc);
    return pc;
}

function onConnectionStats(results) {
  // figure out the peer's ip
  let activeCandidatePair = null;
  let remoteCandidate = null;

  // Search for the candidate pair, spec-way first.
  results.forEach(report => {
    if (report.type === 'transport') {
      activeCandidatePair = results.get(report.selectedCandidatePairId);
    }
  });
  // Fallback for Firefox.
  if (!activeCandidatePair) {
    results.forEach(report => {
      if (report.type === 'candidate-pair' && report.selected) {
        activeCandidatePair = report;
      }
    });
  }
  if (activeCandidatePair && activeCandidatePair.remoteCandidateId) {
    remoteCandidate = results.get(activeCandidatePair.remoteCandidateId);
  }
  if (remoteCandidate) {
    // Statistics are a bit of a mess still...
    console.log('Remote is',
        remoteCandidate.address || remoteCandidate.ip || remoteCandidate.ipAddress,
        remoteCandidate.port || remoteCandidate.portNumber);
  }
}

async function queryBitrateStats(pc, lastResult) {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (!sender) {
        return;
    }
    const stats = await sender.getStats();
    stats.forEach(report => {
      if (report.type === 'outbound-rtp') {
        if (report.isRemote) {
          return;
        }
        const now = report.timestamp;
        const bytes = report.bytesSent;
        const headerBytes = report.headerBytesSent;

        const packets = report.packetsSent;
        if (lastResult && lastResult.has(report.id)) {
          // calculate bitrate
          const bitrate = Math.floor(8 * (bytes - lastResult.get(report.id).bytesSent) /
            (now - lastResult.get(report.id).timestamp));
          const headerrate = Math.floor(8 * (headerBytes - lastResult.get(report.id).headerBytesSent) /
            (now - lastResult.get(report.id).timestamp));

          const packetrate = Math.floor(1000 * (packets - lastResult.get(report.id).packetsSent) /
            (now - lastResult.get(report.id).timestamp));
          console.log(`Bitrate ${bitrate}kbps, overhead ${headerrate}kbps, ${packetrate} packets/second`);
        }
      }
    });
    return stats;
}

// Call a peer based on its id. Adds any tracks from the local stream.
async function call(id) {
    if (peers.has(id)) {
        console.log('it seems you are already in a call with', id);
        return;
    }
    const pc = createPeerConnection(id);
    if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({
        type: 'offer',
        sdp: offer.sdp,
        id,
    }));
    hangupBtn.disabled = false;
    document.getElementById('peerId').innerText = id;
}

// Send a signal to the peer that the call has ended and close the connection.
function hangup(id) {
    if (!peers.has(id)) {
        console.log('no such peer');
        return;
    }
    const pc = peers.get(id);
    pc.close();
    peers.delete(id);
    // Tell the other side
    ws.send(JSON.stringify({
        type: 'bye',
        id,
    }));
}

window.addEventListener('beforeunload', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        peers.forEach((pc, id) => {
            hangup(id);
        });
    }
});
