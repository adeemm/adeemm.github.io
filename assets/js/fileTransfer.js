const BYTES_PER_CHUNK = 1200;

var downloadInProgress = false;
var bytesReceived = 0;
var incomingFileInfo;
var incomingFileData;

var peer;


// Initialize peer and setup its event handlers
function initPeer() {
  peer = new SimplePeer({ initiator: location.hash === '#sendFiles', trickle: false });

  peer.on('signal', async function (data) {
    toggleLoad(true);

    // Get the handshake data and generate the chunk's hash
    var handshake = JSON.stringify(data);
    var hash = await generateHash(handshake).catch(err => alert(err));

    updateHashDisplay(peer.initiator, hash);
    toggleLoad(false);
  });


  peer.on('data', function (data) {
    if(downloadInProgress === false) {
      handleMetadata(data);
    }
    else {
      receiveFile(data);
    }
  });


  peer.on('connect', onConnect)


  peer.on('close', onDisconnect);


  peer.on('error', function (err) {
    console.log('Error:', err);
    displayError('Error', err.message);
  });
}


// Check browser WebRTC support
function isWebRTCSupported() {
  var PeerConn = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
  var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

  return !!PeerConn && !!IceCandidate && !!SessionDescription;
}


// Check browser WebRTC support and throw error if unsupported
function checkWebRTCSupport() {
  if (!isWebRTCSupported()) {
    displayError('Error', 'WebRTC is not supported in your browser! Try using Firefox or Chrome');
  }
  else {
	displayError('Enable CORS Proxy Server', '<iframe style="width: 100%" src="https://cors-anywhere.herokuapp.com/corsdemo"></iframe> <br><br> <button onclick="reset();initPeer()">Next</button>');
	
    // Ask for media permissions to disclose local IPs instead of just mDNS
    //displayError('If you are on the same network', 'Permission must be granted to your webcam & microphone. <br>This is just a workaround, &nbsp;<strong>NO</strong>&nbsp; audio or video is actually used!');
    //navigator.mediaDevices.getUserMedia({audio: true, video: true})
    //.finally(function() {
    //  reset();
    //  initPeer();
    //});
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
  var xhr = new XMLHttpRequest();
  var apiURL = 'https://upaste.de/';

  // Get a URL safe base64 encoding of the signal data
  var encoded = encodeBase64(signal);

  // Bypass CORS restrictions for cross-domain API requests
  var corsProxy = 'https://cors-anywhere.herokuapp.com/';

  // Resolve or reject the returned promise based on the ajax response
  return new Promise(function(resolve, reject) {
    $.ajax({
      url: corsProxy + apiURL,
      type: 'POST',
	  xhr: function() { return xhr; },
      data: { text: encoded },
      success: function(res) {
        try {
		  var hash = xhr.getResponseHeader("X-final-url").split("/").pop();
          resolve(hash);
        }
        catch (err) {
          reject('Error processing share code! Please make sure you typed it correctly.');
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR);
        reject('Failed to generate share code! Try again later');
      }
    });
  });
}


// Convert short hash back into JSON SDP handshake form
function convertHash(hash) {
  var pasteURL = 'https://upaste.de/raw/';

  // Bypass CORS restrictions for cross-domain API requests
  var corsProxy = 'https://cors-anywhere.herokuapp.com/';

  // Resolve or reject the returned promise based on the ajax response
  return new Promise(function(resolve, reject) {
    $.ajax({
      url: corsProxy + pasteURL + hash,
      type: 'GET',
      success: function(res) {
        try {
          var decoded = decodeBase64(res);
          resolve(decoded);
        }
        catch (err) {
          reject('Error processing share code! Please make sure you typed it correctly.');
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.log(jqXHR);
        reject('Failed to decode share code! Try again later');
      }
    });
  });
}


// Load hash from the specified text input element
async function loadHash(hash) {
  toggleLoad(true);

  // Get handshake data from the condensed hash
  var handshake = await convertHash(hash)
    .catch(function(err) {
      alert(err);
      toggleLoad(false);
      return;
    });

  // Handle the handshake data
  peer.signal(JSON.parse(handshake));

  toggleLoad(false);
}



// Get file from input and send to other peer
function sendFile() {
  var fileReader = new FileReader();
  var fileList = document.querySelector('#selectedFile').files;
  var file = fileList[0];
  var currentChunk = 0;

  toggleLoad(true);

  try {
    // Send metadata first
    peer.send(JSON.stringify({
        fileName: file.name,
        fileSize: file.size
    }));

    // Handle fileReader load event
    fileReader.onload = function() {
      peer.send(fileReader.result);
      currentChunk++;

      // Read the file buffer until we reach the end
      if(BYTES_PER_CHUNK * currentChunk < file.size) {
          readNextChunk(fileReader, file, currentChunk);
      }
      else {
        toggleLoad(false);
      }
    };

    readNextChunk(fileReader, file, currentChunk);
  }
  catch (err) {
    toggleLoad(false);
    alert('Error sending file!');
    console.log(err);
  }
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
  $('#downloadInfo').html('Downloading ' + incomingFileInfo.fileName + ' - ' + size);
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


// Event handler for menu link click (navigates before initPeer() checks location hash)
$('#uploadFileLink').on('click', function(ev) {
  toggleLoad(true);
  window.location = ev.target.href;
  checkWebRTCSupport();
});


// Event handler for menu link click (navigates before initPeer() checks location hash)
$('#downloadFileLink').on('click', function(ev) {
  window.location = ev.target.href;
  checkWebRTCSupport();
});


// Event handler for unloading page
$(window).unload(function () {
  reset();
});


// Handle showing and hiding of hash input elements
function updateHashDisplay(initiator, generatedHash) {
  toggleLoad(true);

  if (initiator) {
    $('#shareHashOutput').val(generatedHash);
  }
  else {
    $('#getOffer').css('display', 'none');
    $('#receiveHashOutput').val(generatedHash);
    $('#sendAnswer').css('display', 'block');
  }
}


// Hide handshake form elements and display file upload form after connecting
function onConnect() {
  $('#sendOffer').css('display', 'none');
  $('#sendAnswer').css('display', 'none');
  $('#sendFileForm').css('display', 'block');
  $('#downloadForm').css('display', 'block');

  toggleLoad(false);
}


// Hide file upload form and show handshake elements after disconnecting
function onDisconnect() {
  reset();
  location.hash = '#fileMenu';
  alert('Peer disconnected')
}


// Update the file download percent user display
function updateDownloadProgress(progress) {
  $('#downloadPercent').html(progress + '% complete');
}


// Hide form elements and display an error message
function displayError(title, message) {
  $('#shareFileForm').css('display', 'none');
  $('#shareFileError').css('display', 'block');
  $('#shareFileErrorMessage').html('<h3>' + title + ':</h3>' + message);

  $('#receiveFileForm').css('display', 'none');
  $('#receiveFileError').css('display', 'block');
  $('#receiveFileErrorMessage').html('<h3>' + title + ':</h3>' + message);

  toggleLoad(false);
}


// Reset page elements (and destroy peer if initialized)
function reset() {
  $('#sendOffer').css('display', 'block');
  $('#getOffer').css('display', 'block');
  $('#shareFileForm').css('display', 'block');
  $('#receiveFileForm').css('display', 'block');

  $('#sendAnswer').css('display', 'none');
  $('#shareFileError').css('display', 'none');
  $('#receiveFileError').css('display', 'none');

  $('#shareHashOutput').val('');
  $('#shareHashInput').val('');
  $('#receiveHashInput').val('');
  $('#receiveHashOutput').val('');

  $('#sendFileForm').css('display', 'none');
  $('#downloadForm').css('display', 'none');

  $('#selectedFile').text('Select File');

  if (!!peer) {
    peer.destroy();
  }
}


// Toggles the loading indicator
function toggleLoad(shouldShow) {
  $('#loading').toggle(shouldShow);
}


// Event handler for file selection label feedback
$('#selectedFile').change(function() {
  var fileName = $(this).val().split('\\').pop();
  var fileExt = fileName.slice(fileName.lastIndexOf('.') + 1);
  var label = $(this).prop('labels');
  $(label).text('Selected .' + fileExt);
});
