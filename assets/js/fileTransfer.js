/**
 * WebRTC data-channel transfer
 *
 * The handshake is compressed with the sdpz/handoff libraries (sdpz.js,
 * wordlist.js, handoff.js) so the entire session description fits in a short
 * code. The code can be rendered five ways:
 *
 *   24 BIP-39 words (11 bits each)
 *   Crockford base32, no ambiguous glyphs, case-insensitive
 *   CJK ideographs, 14 bits per character
 *   base64url code in a URL fragment
 *   short code: the base64url payload is obfuscated with a pre-shared
 *     key and published to a paste service (only the resulting key is
 *     shared)
 */

// Max file chunk size, kept small to prevent fragmentation issues
var BYTES_PER_CHUNK = 1200;

// STUN server used to discover each peer's public address
var ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// How many gathered candidates go into the code. 3 is usually sufficient
var MAX_CANDIDATES = 3;

// ICE candidate gathering is awaited for 5s
var GATHER_TIMEOUT_MS = 5000;

// Default rendering for the send flow
var DEFAULT_STYLE = 'words';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */
var pc = null;                 // RTCPeerConnection of the current session
var dc = null;                 // data channel on that connection
var mySdp = null;              // our committed local SDP (offer or answer)
var myKind = null;             // 'offer' (send flow) | 'answer' (receive flow)
var myStyle = DEFAULT_STYLE;   // rendering selected in the send flow tabs
var derived = true;            // local SDP uses fingerprint-derived ICE creds
var remoteSet = false;         // the other peer's answer has been accepted

// Receive-side download bookkeeping (same as the original implementation).
var downloadInProgress = false;
var bytesReceived = 0;
var incomingFileInfo = null;
var incomingFileData = [];

// If arrived on a sent "link" code, the URL hash is not an article id,
// so the top-of-file snippet rewrites it to #downloadFiles and stashes the
// code here for pre-filling the receive form.
var pendingCode = null;

// Action to re-run after a failed short-code publish
var shortCodeRetry = null;

/* ------------------------------------------------------------------ *
 * Arrival on a "Link" code
 *
 * Rewrite the hash to the receive article BEFORE the page fires
 * its 'load' event so the theme opens the correct article on load.
 * ------------------------------------------------------------------ */
(function () {
  var h = location.hash;
  // Codes and article ids never share a value
  if (h.length > 1 && !document.getElementById(h.slice(1))) {
    try {
      pendingCode = decodeURIComponent(h.slice(1));
    }
    catch (e) {
      return; // ignore malformed fragment
    }
    location.replace(location.href.split('#')[0] + '#downloadFiles');
  }
})();

// Pre-fill the receive form when the page finishes loading
$(window).on('load', function () {
  if (pendingCode) {
    $('#receiveHashInput').val(pendingCode).focus();
    pendingCode = null;
  }
});

// Check browser WebRTC support
function isWebRTCSupported() {
  var PeerConn = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
  var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
  var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;

  return !!PeerConn && !!IceCandidate && !!SessionDescription;
}

// Entry point for the two fileMenu buttons
function checkWebRTCSupport(sendFlow) {
  if (!isWebRTCSupported()) {
    displayError('Error', 'WebRTC is not supported in your browser! Try using Firefox or Chrome');
  }
  else if (sendFlow) {
    startSending();
  }
  else {
    showHandshakeForms();
  }
}

// Set our local description, preferring the fingerprint-derived ICE
// credentials. Chromium accepts, but Firefox refuses and requires full credentials
async function commitLocalDescription(p, desc) {
  try {
    await p.setLocalDescription({ type: desc.type, sdp: sdpz.withDerivedCredentials(desc.sdp) });
    return true;
  }
  catch (e) {
    await p.setLocalDescription(desc);
    return false;
  }
}

// Wait for ICE gathering to complete
function waitGathering(p, timeoutMs) {
  if (p.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(function (res) {
    function fin() {
      clearTimeout(t);
      p.removeEventListener('icegatheringstatechange', ck);
      res();
    }
    function ck() {
      if (p.iceGatheringState === 'complete') fin();
    }
    var t = setTimeout(fin, timeoutMs);
    p.addEventListener('icegatheringstatechange', ck);
  });
}

// Surface a definitive handshake failure
function watchConnection(p) {
  p.onconnectionstatechange = function () {
    if (p.connectionState === 'failed') {
      displayError('Error', 'No route between the two networks. If both codes were typed correctly, a firewall or symmetric NAT is most likely blocking the direct connection.');
    }
  };
}

// Attach the file-transfer handlers to a data channel
function wireDataChannel(channel) {
  dc = channel;
  dc.onopen = onConnect;
  dc.onclose = onDisconnect;
  dc.onmessage = function (event) {
    // First message is the JSON metadata, the rest are file chunks
    if (downloadInProgress === false) {
      handleMetadata(event.data);
    }
    else {
      receiveFile(event.data);
    }
  };
}

// Tear down the current session
function destroySession() {
  if (dc) {
    dc.onopen = dc.onclose = dc.onmessage = null;
    try { dc.close(); } catch (e) { /* already closed */ }
    dc = null;
  }
  if (pc) {
    pc.ondatachannel = pc.onconnectionstatechange = null;
    try { pc.close(); } catch (e) { /* already closed */ }
    pc = null;
  }
  mySdp = null;
  myKind = null;
  derived = true;
  remoteSet = false;
}

/* ------------------------------------------------------------------ *
 * Rendering (send flow)
 * ------------------------------------------------------------------ */

// Start the send flow and create the peer connection / offer
function startSending() {
  destroySession();
  myKind = 'offer';
  showHandshakeForms();
  toggleLoad(true);
  $('#shareCodeBox').text('Generating… Please wait a moment');
  $('#shareCodeMeta').text('');

  pc = new RTCPeerConnection(ICE_CONFIG);
  watchConnection(pc);
  // Data channel for the file transfer (ordered delivery is default)
  wireDataChannel(pc.createDataChannel('files'));

  (async function () {
    try {
      var offer = await pc.createOffer();
      derived = await commitLocalDescription(pc, offer);
      await waitGathering(pc, GATHER_TIMEOUT_MS);
      mySdp = pc.localDescription.sdp;
      await renderMyCode();
    }
    catch (err) {
      console.log(err);
      displayError('Error', 'Could not create the offer: ' + err.message);
    }
    finally {
      toggleLoad(false);
    }
  })();
}

// Render our code in the currently selected style into the send box.
// Returns a promise so callers can wait out the async short-code publish.
function renderMyCode() {
  if (!mySdp) return Promise.resolve();

  $('#shareCodeBox').text(myStyle === 'short' ? 'Loading short code...' : 'Loading code...');
  $('#shareCodeMeta').text('');
  toggleLoad(true);

  return sdpzHandoff.encodeAsync(mySdp, myStyle, { maxCandidates: MAX_CANDIDATES, type: myKind })
    .then(function (code) {
      // Stale guard: the session may have been reset while rendering
      if (!mySdp || myKind !== 'offer') return;

      if (myStyle === 'short') {
        $('#shareCodeBox').text(code);
        $('#shareCodeMeta').text('Short code — send this key back');
        return;
      }

      // The Link style is the same base64url code embedded in a URL fragment
      var shown = (myStyle === 'b64')
        ? location.href.split('#')[0] + '#' + code
        : code;

      $('#shareCodeBox').text(shown);
      $('#shareCodeMeta').html(codeMeta(code, myStyle));
    })
    .catch(function (err) {
      console.log(err);
      if (myStyle === 'short') {
        shortCodeRetry = function () { hideErrors(); renderMyCode(); };
        displayShortCodeError('send', err.message + ' <br><br> <button type="button" onclick="retryShortCode()">Retry</button>');
        return;
      }
      $('#shareCodeBox').text('Could not build a code: ' + err.message);
      $('#shareCodeMeta').text('');
    })
    .then(function () {
      toggleLoad(false);
    });
}

// One-line description under the code: size, bit count, and network addresses
function codeMeta(code, style) {
  var d = sdpzHandoff.decode(code);
  var unit = (style === 'words')
    ? code.split(/[^A-Za-z]+/).filter(Boolean).length + ' words'
    : code.length + ' characters';
  var carried = d.fields.candidates.length;
  var meta = unit + ' - ' + d.bits + ' bits - ' +
    (carried > 0
      ? carried + ' network address' + (carried > 1 ? 'es' : '') + ' included'
      : 'no addresses');
  if (!derived) {
    meta += ' ICE credentials carried in full';
  }
  return meta;
}


// Publish our code in the Short-code style and show the resulting key
function publishShortCode(side) {
  var $box = (side === 'send') ? $('#shareCodeBox') : $('#receiveCodeBox');
  var $meta = (side === 'send') ? $('#shareCodeMeta') : $('#receiveCodeMeta');
  $box.text('Loading short code...');
  $meta.text('');
  toggleLoad(true);

  sdpzHandoff.encodeAsync(mySdp, 'short', { maxCandidates: MAX_CANDIDATES, type: myKind }).then(function (key) {
    // Stale guard: the session may have been reset while publishing
    if (!mySdp || myKind !== (side === 'send' ? 'offer' : 'answer')) return;
    $box.text(key);
    $meta.text('Short code — send this key back');
  }).catch(function (err) {
    console.log(err);
    shortCodeRetry = function () { hideErrors(); publishShortCode(side); };
    displayShortCodeError(side, err.message + ' <br><br> <button type="button" onclick="retryShortCode()">Retry</button>');
  }).then(function () {
    toggleLoad(false);
  });
}

// Error for the short-code step that keeps the rest of the flow visible
// (unlike displayError(), which hides the forms).
function displayShortCodeError(side, message) {
  var $error = (side === 'send') ? $('#shareFileError') : $('#receiveFileError');
  var $msg = (side === 'send') ? $('#shareFileErrorMessage') : $('#receiveFileErrorMessage');
  $error.css('display', 'block');
  $msg.html('<h3>Short code:</h3>' + message);
}

// Re-run the failed short-code step (wired into the retry buttons above).
function retryShortCode() {
  if (typeof shortCodeRetry === 'function') shortCodeRetry();
}

/* ------------------------------------------------------------------ *
 * Handshake flows
 *
 * Recognizing the peer's code (link, direct code in any alphabet, or
 * short-code paste key) lives in the handoff library: resolve().
 * ------------------------------------------------------------------ */

// Bring the handshake forms back after an error (displayError hides them
// and nothing else re-shows them, so the submit handlers must do it).
function showHandshakeForms() {
  hideErrors();
  $('#shareFileForm').css('display', 'block');
  $('#receiveFileForm').css('display', 'block');
}

// Send flow: the other peer is pasting their reply (must be an answer)
async function submitSendReply() {
  var raw = $('#shareHashInput').val().trim();
  showHandshakeForms();

  if (!raw) {
    displayError('Error', 'Nothing pasted yet!');
    return;
  }
  if (remoteSet) {
    displayError('Error', 'A handshake is already in progress. If it is not connecting, close this tab and start again.');
    return;
  }

  toggleLoad(true);
  var got;
  try {
    got = await sdpzHandoff.resolve(raw);
  }
  catch (e) {
    console.log(e);
    displayError('Error', e.message);
    toggleLoad(false);
    return;
  }
  toggleLoad(false);

  if (got.type !== 'answer') {
    displayError('Error', 'That is a starting code, not a reply. Ask the peer to send back the code that appears after they enter yours.');
    return;
  }

  try {
    await pc.setRemoteDescription({ type: 'answer', sdp: got.sdp });
    remoteSet = true;
    // The data channel opening fires onConnect(), which swaps in the form.
  }
  catch (e) {
    console.log(e);
    displayError('Error', 'Could not accept the reply: ' + e.message);
  }
}

// Receive flow auto-detected
async function submitReceiveCode() {
  var raw = $('#receiveHashInput').val().trim();
  showHandshakeForms();

  if (!raw) {
    displayError('Error', 'Nothing pasted yet!');
    return;
  }

  toggleLoad(true);
  var got;
  try {
    got = await sdpzHandoff.resolve(raw);
  }
  catch (e) {
    console.log(e);
    displayError('Error', e.message);
    toggleLoad(false);
    return;
  }
  toggleLoad(false);

  if (got.type !== 'offer') {
    displayError('Error', 'That is a reply code, not a starting code. Ask the peer to send you the code that appears first.');
    return;
  }

  // A fresh connection for each attempt, so re-submitting a corrected code starts over.
  destroySession();
  myKind = 'answer';

  try {
    pc = new RTCPeerConnection(ICE_CONFIG);
    watchConnection(pc);
    pc.ondatachannel = function (e) { wireDataChannel(e.channel); };
    await pc.setRemoteDescription({ type: 'offer', sdp: got.sdp });
    derived = await commitLocalDescription(pc, await pc.createAnswer());
    await waitGathering(pc, GATHER_TIMEOUT_MS);
    mySdp = pc.localDescription.sdp;

    $('#getOffer').css('display', 'none');
    $('#receiveReply').css('display', 'block');

    // Answer in the same format as given
    if (got.source === 'short') {
      // Paste key: publish our answer to the paste service
      publishShortCode('receive');
    }
    else {
      var style = (got.source === 'link') ? 'b64' : got.source;
      var code = sdpzHandoff.encode(mySdp, style, { maxCandidates: MAX_CANDIDATES, type: myKind });
      var shown = (style === 'b64')
        ? location.href.split('#')[0] + '#' + code
        : code;
      $('#receiveCodeBox').text(shown);
      $('#receiveCodeMeta').html(codeMeta(code, style));
    }
  }
  catch (e) {
    console.log(e);
    displayError('Error', 'Could not build the reply: ' + e.message);
  }
}

// Get file from input and send to other peer
function sendFile() {
  var fileReader = new FileReader();
  var fileList = document.querySelector('#selectedFile').files;
  var file = fileList[0];
  var currentChunk = 0;

  if (!file || !dc || dc.readyState !== 'open') {
    alert('Error sending file!');
    return;
  }

  toggleLoad(true);

  try {
    // Send metadata first
    dc.send(JSON.stringify({
      fileName: file.name,
      fileSize: file.size
    }));

    // Handle fileReader load event
    fileReader.onload = function () {
      dc.send(fileReader.result);
      currentChunk++;

      // Read the file buffer until we reach the end
      if (BYTES_PER_CHUNK * currentChunk < file.size) {
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

  var progress = ((bytesReceived / incomingFileInfo.fileSize) * 100).toFixed(2);
  updateDownloadProgress(progress);

  if (bytesReceived === incomingFileInfo.fileSize) {
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
  if (anchor.click) {
    anchor.click();
  }
  else {
    var ev = document.createEvent('MouseEvents');
    ev.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
    anchor.dispatchEvent(ev);
  }
}

// Convert bytes into larger units
function formatBytes(bytes, decimals) {
  if (bytes == 0) return '0 Bytes';

  var k = 1024,
    dm = decimals <= 0 ? 0 : decimals || 2,
    sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
    i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Hide handshake form elements and display file upload form after connecting
function onConnect() {
  hideErrors();
  $('#sendOffer').css('display', 'none');
  $('#sendAnswer').css('display', 'none');
  $('#receiveReply').css('display', 'none');
  $('#sendFileForm').css('display', 'block');
  $('#downloadForm').css('display', 'block');

  toggleLoad(false);
}

// Hide file upload form and show handshake elements after disconnecting
function onDisconnect() {
  if (!pc) return;
  destroySession();
  reset();
  location.hash = '#fileMenu';
  alert('Peer disconnected');
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

// Clear any error message
function hideErrors() {
  $('#shareFileError').css('display', 'none');
  $('#receiveFileError').css('display', 'none');
}

// Reset page elements (and destroy the session if initialized)
function reset() {
  destroySession();

  $('#sendOffer').css('display', 'block');
  $('#getOffer').css('display', 'block');
  $('#shareFileForm').css('display', 'block');
  $('#receiveFileForm').css('display', 'block');

  $('#sendAnswer').css('display', 'none');
  $('#receiveReply').css('display', 'none');
  hideErrors();

  $('#shareHashInput').val('');
  $('#receiveHashInput').val('');

  $('#shareCodeBox').text('');
  $('#shareCodeMeta').text('');
  $('#receiveCodeBox').text('');
  $('#receiveCodeMeta').text('');

  // Back to the default tab
  myStyle = DEFAULT_STYLE;
  $('#shareCodeTabs button').each(function () {
    $(this).attr('aria-pressed', this.getAttribute('data-style') === DEFAULT_STYLE);
  });

  $('#sendFileForm').css('display', 'none');
  $('#downloadForm').css('display', 'none');

  // Restore the "Select File" label
  var fileLabel = $('#selectedFile').prop('labels')[0];
  if (fileLabel && fileLabel.dataset.originalText) {
    fileLabel.textContent = fileLabel.dataset.originalText;
  }
  $('#selectedFile').val('');

  $('#downloadInfo').text('Waiting for a file to download...');
  $('#downloadPercent').text('');

  downloadInProgress = false;
  bytesReceived = 0;
  incomingFileInfo = null;
  incomingFileData = [];
}

// Toggles the loading indicator
function toggleLoad(shouldShow) {
  $('#loading').toggle(shouldShow);
}

/* ------------------------------------------------------------------ *
 * Event wiring
 * ------------------------------------------------------------------ */

// Event handler for the "Share Files" menu link
$('#uploadFileLink').on('click', function (ev) {
  window.location = ev.target.href;
  checkWebRTCSupport(true);
});

// Event handler for the "Receive Files" menu link
$('#downloadFileLink').on('click', function (ev) {
  window.location = ev.target.href;
  checkWebRTCSupport(false);
});

// Style tabs in the send flow
$('#shareCodeTabs').on('click', 'button[data-style]', function () {
  myStyle = this.getAttribute('data-style');
  $('#shareCodeTabs button').attr('aria-pressed', 'false');
  $(this).attr('aria-pressed', 'true');
  hideErrors();
  if (mySdp) renderMyCode();
});

// Copy buttons for the code boxes (the boxes use user-select: all as a fallback if the clipboard API is unavailable)
$('#copyShareCode, #copyReceiveCode').on('click', function () {
  var $box = (this.id === 'copyShareCode') ? $('#shareCodeBox') : $('#receiveCodeBox');
  var text = $box.text();
  if (!text) return;

  var button = this;
  var done = function (ok) {
    button.textContent = ok ? 'Copied' : 'Select it and copy';
    setTimeout(function () { button.textContent = 'Copy'; }, 1600);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () { done(true); },
      function () { done(false); }
    );
  }
  else {
    done(false);
  }
});

// Event handler for file selection label feedback
$('#selectedFile').change(function () {
  var file = $(this).val();
  if (!file) return;
  var fileName = file.split('\\').pop();
  var fileExt = fileName.slice(fileName.lastIndexOf('.') + 1);
  var label = $(this).prop('labels')[0];
  if (!label) return;
  if (!label.dataset.originalText) label.dataset.originalText = label.textContent;
  label.textContent = 'Selected .' + fileExt;
});

// Event handler for unloading page
$(window).unload(function () {
  reset();
});
