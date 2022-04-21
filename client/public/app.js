mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));
// DEfault configuration - Change these if you have a different STUN or TURN server.
const configuration = {
  iceServers: [
    {
      urls: 'turn:turn.ggg.systems:3478',
      username: 'test',
      credential: 'test123',
    },
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 0,
};
let peerConnection = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

const collectIceCandidates = (roomRef, peerConnection,
                              localName, remoteName) => {
  const candidatesCollection = roomRef.collection(localName);

  peerConnection.onicecandidate = ( event => {
    if (event.candidate) {
      const json = event.candidate.toJSON();
      console.log('local icecandidate', json);
      candidatesCollection.add(json);
    }
  });

  roomRef.collection(remoteName).onSnapshot(snapshot => {
    snapshot.docChanges().forEach(change => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        console.log('remote icecandidate', candidate);
        peerConnection.addIceCandidate(candidate);
      }
    });
  })
};

function init() {
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));
  openUserMedia();
}

async function joinRoom() {
  document.querySelector('#joinBtn').disabled = true;
  const db = firebase.firestore();
  const roomRef = await db.collection('rooms').orderBy("date", "desc").limit(1).get();
  roomRef.forEach((d)=>{
    console.log(d);
  })
  document.querySelector('#confirmJoinBtn').
      addEventListener('click', async () => {
        roomId = document.querySelector('#room-id').value;
        console.log('Join room: ', roomId);
        document.querySelector(
            '#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
        await joinRoomById(roomId);
      }, {once: true});

  roomDialog.open();
}

async function joinRoomById(roomId) {
  const db = firebase.firestore();
  const roomRef = db.collection('rooms').doc(`${roomId}`);
  const roomSnapshot = await roomRef.get();
  console.log('Got room:', roomSnapshot.exists);

  if (roomSnapshot.exists) {
    console.log('Create PeerConnection with configuration: ', configuration);
    peerConnection = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners();
    // localStream.getTracks().forEach(track => {
    //   peerConnection.addTrack(track, localStream);
    // });

    // Code for collecting ICE candidates below
      collectIceCandidates(roomRef, peerConnection, 'calleeCandidates','callerCandidates');
    // Code for collecting ICE candidates above

    peerConnection.addEventListener('track', event => {
      console.log('Got remote track:', event.streams[0]);
      event.streams[0].getTracks().forEach(track => {
        console.log('Add a track to the remoteStream:', track);
        remoteStream.addTrack(track);
      });
    });

    // Code for creating SDP answer below
    const offer = roomSnapshot.data().offer;
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    const roomWithAnswer = {
      answer: {
        type: answer.type,
        sdp: answer.sdp
      }
    }
    await roomRef.update(roomWithAnswer);
    // Code for creating SDP answer above

    // Listening for remote ICE candidates below

    // Listening for remote ICE candidates above
  }
}

async function openUserMedia(e) {
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    const db = firebase.firestore();
    const roomRef = db.collection('rooms').doc(roomId);
    await roomRef.delete();
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}
init();
