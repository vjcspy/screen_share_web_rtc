import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
} from 'firebase/firestore';

const IS_CLIENT = true;
let stream: any;
let pc: any;
let checkInterval: any;
let maxErrorCount = 0;

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    myPing() {
      ipcRenderer.send('ipc-example', 'ping');
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
          func(...args);
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, subscription);

        return () => ipcRenderer.removeListener(channel, subscription);
      }

      return undefined;
    },
    once(channel: string, func: (...args: unknown[]) => void) {
      const validChannels = ['ipc-example'];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.once(channel, (_event, ...args) => func(...args));
      }
    },
  },
});

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyDx2LvkhWpt3LscQ3y611eYxzFw758IPII',
  authDomain: 'fir-rtc-2c88f.firebaseapp.com',
  projectId: 'fir-rtc-2c88f',
  storageBucket: 'fir-rtc-2c88f.appspot.com',
  messagingSenderId: '315385738234',
  appId: '1:315385738234:web:b8b549e7ed05d1356baa43',
  measurementId: 'G-XPBD4GVS6N',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// const clearCollection = async () => {
//   const querySnapshot = await getDocs(collection(db, 'rooms'));
//   querySnapshot.forEach((doc) => {
//     console.log(`delete ${doc.id}`);
//     if (doc) {
//       deleteDoc(doc.ref).catch((e) => {
//         console.log('delete doc error', e);
//       });
//     }
//   });
// };

const configuration: any = {
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

function registerPeerConnectionListeners(peerConnection: any) {
  const closeAndReconnect = () => {
    if (
      peerConnection?.connectionState === 'failed' ||
      peerConnection?.signalingState === 'closed'
    ) {
      try {
        peerConnection.close();
        // eslint-disable-next-line no-param-reassign
        peerConnection = null;
      } catch (e) {
        console.log('try close pc error', e);
      }
      // delete all records
      // clearCollection();
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      ipcRenderer.send('recreate-window', 'ping');
    }
  };

  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`
    );
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
    closeAndReconnect();
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
    closeAndReconnect();
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`
    );
  });
}

const collectIceCandidates = (
  roomRef: any,
  peerConnection: any,
  localName: any,
  remoteName: any
) => {
  const candidatesCollection = collection(roomRef, localName);

  peerConnection.onicecandidate = (event: any) => {
    if (event.candidate) {
      const json = event.candidate.toJSON();
      console.log('local icecandidate', json);
      addDoc(candidatesCollection, json);
    }
  };

  onSnapshot(collection(roomRef, remoteName), (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        console.log('remote icecandidate', candidate);
        peerConnection.addIceCandidate(candidate);
      }
    });
  });
};
// @ts-ignore
async function izCreateOffer(screenStream: any) {
  maxErrorCount = 0;
  if (IS_CLIENT && screenStream) {
    pc = new RTCPeerConnection(configuration);
    registerPeerConnectionListeners(pc);

    screenStream.getTracks().forEach((track: any) => {
      pc.addTrack(track, screenStream);
    });

    const offer = await pc.createOffer();

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
        date: new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/-/g, '/')
          .replace('T', ' '),
      },
    };

    try {
      const docRef = await addDoc(collection(db, 'rooms'), roomWithOffer);
      console.log('Document written with ID: ', docRef.id);

      onSnapshot(docRef, async (snapshot) => {
        console.log('Got updated room:', snapshot.data());
        const data: any = snapshot.data();
        if (!pc.currentRemoteDescription && data.answer) {
          console.log('Set remote description: ', data.answer);
          const answer = new RTCSessionDescription(data.answer);
          await pc.setRemoteDescription(answer);
        }
      });

      collectIceCandidates(docRef, pc, 'callerCandidates', 'calleeCandidates');
      await pc.setLocalDescription(offer);
    } catch (e) {
      console.error('Error create offer', e);
    }
  }
}

// STREAM SCREEN
function handleStream() {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('content loaded');
    const video = document.querySelector('#localVideo');
    izCreateOffer(stream);
    if (video && !IS_CLIENT) {
      // @ts-ignore
      video!.srcObject = stream;
      // @ts-ignore
      video!.onloadedmetadata = (_e) => video!.play();
    }
  });
}

ipcRenderer.on('SET_SOURCE', async (_event, sourceId) => {
  console.log('=>>> got source stream');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-ignore
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: 1280,
          maxWidth: 1280,
          minHeight: 720,
          maxHeight: 720,
        },
      },
    });
    handleStream();
  } catch (e) {
    console.log('error when get source screen', e);
  }
});

function checkState() {
  if (typeof checkInterval !== 'undefined') {
    clearInterval(checkInterval);
  }

  checkInterval = setInterval(() => {
    console.log('check state');
    if (pc) {
      console.log(`Connection state change: ${pc.connectionState}`);
      console.log(`Signaling state change: ${pc.signalingState}`);
    } else if (maxErrorCount > 3 && stream) {
      izCreateOffer(stream);
    } else {
      // eslint-disable-next-line no-plusplus
      ++maxErrorCount;
    }
  }, 10000);
}
checkState();
