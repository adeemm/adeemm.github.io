const BYTES_PER_CHUNK = 1200;

var downloadInProgress = false;
var bytesReceived = 0;
var incomingFileInfo;
var incomingFileData;

var peer;



// Initialize peer and setup its event handlers
function initPeer() {
  peer = new SimplePeer({ initiator: location.hash === '#sendFiles', trickle: false });

  peer.on('signal', function (data) {
    var handshake = JSON.stringify(data);
    var chunks = chunkString(handshake, 200);
    var hashes = chunks.map(generateHash);
    var generatedHash = hashes.join('-');
    updateHashDisplay(peer.initiator, generatedHash);
  });

  peer.on('connect', function () {
    onConnect();
  })

  peer.on('data', function (data) {
    if(downloadInProgress === false) {
      handleMetadata(data);
    }
    else {
      receiveFile(data);
    }
  });

  peer.on('close', function () {
    onDisconnect();
  });

  peer.on('error', function (err) {
    console.log('Error:', err);
    displayError(err.message);
  });
}



// Check browser WebRTC support
function isWebRTCSupported() {
  var PeerConn = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
  var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
  var UserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.msGetUserMedia || navigator.mozGetUserMedia;
  return !!PeerConn && !!IceCandidate && !!SessionDescription && !!UserMedia;
}


// Check browser WebRTC support and throw error if unsupported
function checkWebRTCSupport() {
  if (!isWebRTCSupported()) {
    displayError('WebRTC is not supported in your browser! Try using Firefox or Chrome');
  }
  else {
    reset();
    initPeer();
  }
}


// Base64 encode the handshake and make it URL safe (according to RFC 4648)
function encodeBase64(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/\=+$/, '');
}


// Return the decoded string from a URL safe Base64 encoding
function decodeBase64(str) {
  // Append any necessary '=' to the end
  var pad = str.length % 4;
  if (pad != 0) {
    pad = 4 - pad;
    str += '='.repeat(pad);
  }

  // Replace URL safe characters back to their original Base64 enconding
  var base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  return atob(base64);
}


// Split a long string into smaller chunks
function chunkString(input, size) {
  var numChunks = Math.ceil(input.length / size);
  var chunks = new Array(numChunks);

  for (let i = 0, j = 0; i < numChunks; ++i, j += size) {
    chunks[i] = input.substr(j, size);
  }

  return chunks;
}


// Returns the hostname (excluding the TLD) of a specified URL
function getURLHostname(url) {
  var hostname;

  if (url.indexOf('//') > -1) {
    hostname = url.split('/')[2];
  }
  else {
    hostname = url.split('/')[0];
  }

  return hostname.substr(0, hostname.indexOf('.'));
}


// Convert bytes into larger units
function formatBytes(bytes, decimals) {
  if(bytes == 0) return '0 Bytes';

  var k = 1024,
      dm = decimals <= 0 ? 0 : decimals || 2,
      sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
      i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}



// Return a short, user-friendly hash from long SDP handshake data
function generateHash(signal) {
  var shorteningAPI = 'http://ulvis.net/API/write/get?url=';

  // Get a URL safe base64 encoding of the signal data
  var encoded = encodeBase64(signal);

  // Generate URL to pass to URL shortening service
  var fakeURL = 'http://' + encoded + '.com';

  // Bypass CORS restrictions for cross-domain API requests
  var corsProxy = 'https://cors-anywhere.herokuapp.com/';

  // TODO: fix synchronous call and add additional handler in sucess function maybe
  var hash;

  $.ajax({
    url: corsProxy + shorteningAPI + fakeURL + '&private=1',
    type: 'GET',
    async: false,
    success: function(res) {
      hash = res.data.id;
    },
    error: function(jqXHR, textStatus, errorThrown) {
      displayError('Failed to generate share code! Try again later');
      console.log(jqXHR);
    }
  });

  return hash;
}


// Convert short hash back into JSON SDP handshake form
function convertHash(hash) {
  var shorteningAPI = 'http://ulvis.net/API/read/get?id=';

  // Bypass CORS restrictions for cross-domain API requests
  var corsProxy = 'https://cors-anywhere.herokuapp.com/';

  // TODO: fix synchronous call and add additional handler in sucess function maybe
  var decoded;

  $.ajax({
    url: corsProxy + shorteningAPI + hash + '&private=1',
    type: 'GET',
    async: false,
    success: function(res) {
      var redirect = res.data.full;
      var hostname = getURLHostname(redirect);
      decoded = decodeBase64(hostname);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      displayError('Failed to decode share code! Try again later');
      console.log(jqXHR);
    }
  });

  return decoded;
}


// Load hash from the specified text input element
function loadHash(textID) {
  // Get delimited data from text input
  var delimited = document.querySelector(textID).value;

  // Split delimited data into an array
  var hashes = delimited.split('-');

  // Remove any empty elements
  var filteredHashes = hashes.filter(Boolean);

  // Convert each element back into a JSON chunk
  var converts = filteredHashes.map(convertHash);

  // Join each chunk back together
  var handshake = converts.join('');

  // Handle the handshake data
  peer.signal(JSON.parse(handshake));
}



// Get file from input and send to other peer
function sendFile() {
  var fileReader = new FileReader();
  var fileList = document.querySelector('#selectedFile').files;
  var file = fileList[0];
  var currentChunk = 0;

  // Send metadata first
  peer.send(JSON.stringify({
      fileName: file.name,
      fileSize: file.size
  }));

  // Handle fileReader load event
  fileReader.onload = function() {
    peer.send(fileReader.result);
    currentChunk++;

    // Check if last was read
    if(BYTES_PER_CHUNK * currentChunk < file.size) {
        readNextChunk(fileReader, file, currentChunk);
    }
  };

  readNextChunk(fileReader, file, currentChunk);
}


// Read the next chunk of data in the file
function readNextChunk(fileReader, file, currentChunk) {
  var start = BYTES_PER_CHUNK * currentChunk;
  var end = Math.min(file.size, start + BYTES_PER_CHUNK);
  fileReader.readAsArrayBuffer(file.slice(start, end));
}


// Get file name, size and display to user
function handleMetadata(data) {
  incomingFileInfo = JSON.parse(data.toString());
  incomingFileData = [];
  bytesReceived = 0;
  downloadInProgress = true;

  var size = formatBytes(incomingFileInfo.fileSize);
  document.querySelector('#downloadInfo').innerHTML = 'Downloading ' + incomingFileInfo.fileName + ' - ' + size;
}


// Handle receiving a chunk of data (that's not a header)
function receiveFile(data) {
  bytesReceived += data.byteLength;
  incomingFileData.push(data);

  var progress = ((bytesReceived / incomingFileInfo.fileSize) * 100).toFixed(2)
  updateDownloadProgress(progress);

  if(bytesReceived === incomingFileInfo.fileSize) {
    finishDownload();
  }
}


// Get received file data and save it to the user's filesystem
function finishDownload() {
  downloadInProgress = false;

  var blob = new window.Blob(incomingFileData);

  // Create a fake anchor element linking to the data
  var anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = incomingFileInfo.fileName;
  anchor.textContent = 'download';

  // Click the fake link to pass the data on to the browser's download handler
  if(anchor.click) {
      anchor.click();
  }
  else {
      var ev = document.createEvent('MouseEvents');
      ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
      anchor.dispatchEvent(ev);
  }
}



// Event handler for menu link click (navigate before initPeer() checks location hash)
$('#uploadFileLink').on('click', function(ev) {
  window.location = ev.target.href;
  checkWebRTCSupport();
});


// Event handler for menu link click (navigate before initPeer() checks location hash)
$('#downloadFileLink').on('click', function(ev) {
  window.location = ev.target.href;
  checkWebRTCSupport();
});


// Event handler for hash input
$('#receiveHashInput').on('input', function(ev) {
  var input = document.querySelector('#receiveHashInput');

  // Automatically add '-' character to input
  var value = input.value.split('-').join('');
  if((value.length > 0) && (value.length % 3 == 0)) {
    input.value += '-'
  }
});

// Event handler for hash input
$('#shareHashInput').on('input', function(ev) {
  var input = document.querySelector('#shareHashInput');

  // Automatically add '-' character to input
  var value = input.value.split('-').join('');
  if((value.length > 0) && (value.length % 3 == 0)) {
    input.value += '-'
  }
});


// Event handler for unloading page
$(window).unload(function () {
  reset();
});


// Handle hiding and showing hash inputs
function updateHashDisplay(initiator, generatedHash) {
  if (initiator) {
    var output = document.querySelector('#shareHashOutput');
    output.value = generatedHash;
  }
  else {
    document.querySelector('#getOffer').style.display = 'none';
    var output = document.querySelector('#receiveHashOutput');
    output.value = generatedHash;
    document.querySelector('#sendAnswer').style.display = 'block';
  }
}


// Hide handshake elements and display file upload form after connected
function onConnect() {
  document.querySelector('#sendOffer').style.display = 'none';
  document.querySelector('#sendAnswer').style.display = 'none';
  document.querySelector('#sendFileForm').style.display = 'block';
  document.querySelector('#downloadForm').style.display = 'block';
}


// Hide file upload form and show handshake elements after disconnected
function onDisconnect() {
  reset();
}


// Update the file download percent user display
function updateDownloadProgress(progress) {
  document.querySelector('#downloadPercent').innerHTML = progress + '% complete';
}


// Hide form elements and display an error message
function displayError(message) {
  document.querySelector('#shareFileForm').style.display = 'none';
  document.querySelector('#shareFileError').style.display = 'block';
  document.querySelector('#shareFileErrorMessage').innerHTML = '<h3>ERROR:</h3>' + message;

  document.querySelector('#receiveFileForm').style.display = 'none';
  document.querySelector('#receiveFileError').style.display = 'block';
  document.querySelector('#receiveFileErrorMessage').innerHTML = '<h3>ERROR:</h3>' + message;
}


// Reset page elements and destroy peer if initialized
function reset() {
  document.querySelector('#sendOffer').style.display = 'block';
  document.querySelector('#getOffer').style.display = 'block';
  document.querySelector('#sendAnswer').style.display = 'none';
  document.querySelector('#sendFileForm').style.display = 'none';
  document.querySelector('#downloadForm').style.display = 'none';

  if (!!peer) {
    peer.destroy();
  }
}
