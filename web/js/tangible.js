//----------------------------------------------------------------------
// use to calibrate the current camera setup
//----------------------------------------------------------------------
const ROWS = 5;
const COLS = 16;
const VWIDTH = 1280;   // camera width (pixels)
const VHEIGHT = 720;   // camera height (pixels)

var crop = [51, 211, 1222, 382];

var bpm = 90.0, newBpm = 90.0;   // beats per minute
var swing = 10, newSwing = 10;  // swing percentage

// color distance threshold to prevent false positives
var CUTOFF = 40;

var DRUM_KIT = DRUMS_ROLAND;

var VAR_VALUES = {
  "kick" : 1,
  "snare" : 2,
  "hat" : 4,
  "open_hat" : 5,
  "high_tom" : 6,
  "mid_tom" : 7,
  "low_tom" : 8,
  "cymbal" : 9,
  "clap" : 10,
  "rimshot" : 11,
  "cowbell" : 3
};

var COLORS = {
  red : { color : [ 255, 0, 0 ], calibrated : [ 255, 93, 83 ] },
  orange : { color : [ 255, 150, 40 ], calibrated : [ 255, 193, 120 ] },
  yellow : { color : [ 255, 255, 0 ], calibrated : [ 255, 255, 215 ] },
  green : { color : [ 90, 255, 150 ], calibrated : [ 202, 254, 176 ] },
  blue : { color : [ 50, 50, 255 ], calibrated : [ 0, 141, 244 ] },
  purple : { color : [ 255, 50, 200 ], calibrated : [ 255, 156, 188 ] },
  empty : { color : [ 0, 0, 0], calibrated : [100, 100, 100 ] }
};


var context = new AudioContext();
var playing = false;   // is beat machine playing or paused
var canvas;
var ctx; // canvas rendering context
var video;  // <video> element
var videoStream = null;
var slots = []; // all of the balls recognized by the camera in this frame
var start_time = 0;
var debug = false;
var requeued = false;
var qrcode = new QRCode(document.getElementById('qrcode'), {
    text: "http://jindo.dev.naver.com/collie",
    width: 150,
    height: 150,
    colorDark : "#000000",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
});


//------------------------------------------------------------------------
// start / stop audio playback
//------------------------------------------------------------------------
function play() {
  if (!playing) {
    start_time = context.currentTime;
    scheduleSounds(0);
    playing = true;
    requeued = false;
    tick(0);
    document.querySelector('#play-button').classList.add('hidden');
    document.querySelector('#pause-button').classList.remove('hidden');
  }
}

function pause() {
  if (playing) {
    stopSounds();
    playing = false;
    document.querySelector('#play-button').classList.remove('hidden');
    document.querySelector('#pause-button').classList.add('hidden');
  }
}

function playPause() {
  playing ? pause() : play();
  //timer = setInterval(function () { tick(); } , beatsToSeconds(0.125) * 1000);
}


//------------------------------------------------------------------------
// stop all sounds
//------------------------------------------------------------------------
function stopSounds() {
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      slots[i][j].cancelSound();
    }
  }
}


//------------------------------------------------------------------------
// cue sequence of balls to start playback
//------------------------------------------------------------------------
function scheduleSounds(delayBeats) {
  for (let i = 0; i < COLS; i++) {
    for (let j = 0; j < ROWS; j++) {
      slots[i][j].scheduleSound(delayBeats);
    }
  }
}


//------------------------------------------------------------------------
// change tempo
//------------------------------------------------------------------------
function setTempo(t) {
  newBpm = Math.min(Math.max(t, 5), 300);
  document.querySelector("#tempo").innerHTML = newBpm;
  tick();
}

function tempoUp() { setTempo(bpm + 1); }
function tempoDown() { setTempo(bpm - 1); }




//------------------------------------------------------------------------
// change swing (s is value between 0 and 100)
//------------------------------------------------------------------------
function setSwing(s) {
  newSwing = Math.round(Math.min(Math.max(s, 0), 100));
  document.querySelector("#swing").innerHTML = newSwing + "%";
}

function swingUp() { setSwing(newSwing + 1); }
function swingDown() { setSwing(newSwing - 1); }


function toggleDebug() {
  debug = !debug;
  if (debug) {
    document.querySelector('#calibrate-button').classList.remove('hidden');
  } else {
    document.querySelector('#calibrate-button').classList.add('hidden');
  }
  draw();
}


function getCurrentBeat() {
  return ((context.currentTime - start_time) * bpm / 60) % 4.0;
}


//------------------------------------------------------------------------
// start / stop video tracking
//------------------------------------------------------------------------
function startStopVideo() {
  (videoStream == null) ? startVideo() : stopVideo();
}


function startVideo() {
  if (videoStream == null) {
    navigator.mediaDevices.getUserMedia(
      {
        video: {
          width: { min: VWIDTH },
          height: { min: VHEIGHT }
        }
      })
      .then(function (s) {
        videoStream = s;
        video.srcObject = s;
        video.onloadedmetadata = function(e) { video.play(); };
        tick(0);
        document.querySelector('#start-video-button').classList.add('hidden');
        document.querySelector('#stop-video-button').classList.remove('hidden');
      })
      .catch(function (err) { console.log("Unable to start video stream!"); });
  }
}


function stopVideo() {
  if (videoStream != null) {
    //trackerTask.stop();
    videoStream.getTracks().forEach(function(track) { track.stop(); });
    videoStream = null;
    document.querySelector('#start-video-button').classList.remove('hidden');
    document.querySelector('#stop-video-button').classList.add('hidden');
  }
}

//------------------------------------------------------------------------
// scan an image for color match
//------------------------------------------------------------------------
function scanRect(idata, bx, by, bw, bh, cw) {
  bx = Math.round(bx);
  by = Math.round(by);
  let count = 0, r = 0, g = 0, b = 0;
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      let index = ((y + by) * cw + (x + bx)) * 4;
      r += idata.data[index + 0];
      g += idata.data[index + 1];
      b += idata.data[index + 2];
      count ++;
    }
  }
  return [
    Math.round(r/count),
    Math.round(g/count),
    Math.round(b/count)
  ];
}


//------------------------------------------------------------------------
// distance between two colors
//------------------------------------------------------------------------
function colorDistance(a, b) {
  return Math.sqrt(
    (b[0] - a[0]) * (b[0] - a[0]) +
    (b[1] - a[1]) * (b[1] - a[1]) +
    (b[2] - a[2]) * (b[2] - a[2]));
}


//------------------------------------------------------------------------
// converts to an rgb(r, g, b) color string
//------------------------------------------------------------------------
function colorString(color) {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

//------------------------------------------------------------------------
// calibrate colors
//------------------------------------------------------------------------
function calibrateColors() {
  if (isRunning() && debug) {
    console.log('calibrating');
    for (let drum of DRUM_KIT) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let i=0; i<COLS; i++) {
        for (let j=0; j<ROWS; j++) {
          let slot = slots[i][j];
          if (slot.calibrate != null && slot.calibrate == drum.color) {
            r += slot.scan[0];
            g += slot.scan[1];
            b += slot.scan[2];
            count++;
          }
        }
      }
      if (count > 0) {
        COLORS[drum.color].calibrated = [ r/count, g/count, b/count ];
        console.log(COLORS[drum.color]);
      }
    }

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i=0; i<COLS; i++) {
      for (let j=0; j<ROWS; j++) {
        let slot = slots[i][j];
        if (slot.calibrate == "empty") {
          r += slot.scan[0];
          g += slot.scan[1];
          b += slot.scan[2];
          count++;
        }
      }
    }
    if (count > 0) {
      COLORS.empty.calibrated = [ r/count, g/count, b/count ];
      console.log(COLORS.empty);
    }
  }
}

//------------------------------------------------------------------------
// repaint the canvas
//------------------------------------------------------------------------
function draw(beats) {

  if (canvas && ctx) {
    let w = canvas.width;
    let h = canvas.height;
    let cx = crop[0];
    let cy = crop[1];
    let cw = crop[2];
    let ch = crop[3];
    let bw = cw / COLS;
    let bh = ch / ROWS;
    let m = bw * 0.45;
    let idata = null;

    ctx.save();
    {
      ctx.save();
      {
        ctx.scale(1, -1);
        ctx.translate(0, -h);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(video, cx, VHEIGHT - (cy + h), cw, ch, 0, 0, w, h);

      }
      ctx.restore();

      idata = ctx.getImageData(0, 0, w, h);
      if (debug) drawGrid(0, 0, w, h);

      // draw beat regions
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, bw * 4, h);
      ctx.fillRect(bw * 8, 0, bw * 4, h);

      for (let i=0; i<COLS; i++) {
        for (let j=0; j<ROWS; j++) {
          let bx = i * bw;
          let by = j * bh;
          let scan = scanRect(idata, bx + m, by + m, bw - m * 2, bh - m * 2, w);
          let delta = colorDistance(COLORS.empty.calibrated, scan);
          let drum = null;

          for (let d of DRUM_KIT) {
            let dist = colorDistance(COLORS[d.color].calibrated, scan);
            if (dist < CUTOFF && dist < delta) {
              drum = d;
              delta = dist;
            }
          }

          slots[i][j].setDrum(drum);
          slots[i][j].scan = scan;
          if (!debug) {
            slots[i][j].draw(bx, by, bw, bh);
          } else {
            slots[i][j].drawCalibration(bx, by, bw, bh);
          }
        }
      }

      if (playing) {
        let bx = getCurrentBeat() * w / 4.0;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx, h);
        ctx.strokeStyle = "gold";
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}


function drawGrid(cx, cy, cw, ch) {
  let bw = cw / COLS;
  let bh = ch / ROWS;
  ctx.strokeStyle = 'red';
  ctx.strokeWidth = 2;
  ctx.beginPath();
  for (let i=0; i<=COLS; i++) {
    ctx.moveTo(cx + i * bw, cy);
    ctx.lineTo(cx + i * bw, cy + ch);
  }
  for (let j=0; j<=ROWS; j++) {
    ctx.moveTo(cx, cy + j * bh);
    ctx.lineTo(cx + cw, cy + j * bh);
  }
  ctx.stroke();
}


function isRunning() {
  return videoStream != null;
}


function xToBeats(x) {
  let cw = crop[3];
  let beatWidth = cw / 4.0;
  x -= crop[0];
  x -= beatWidth * 0.125;
  let p = x / cw;
  let slice = Math.round(p * 16.0);
  return slice / 4.0;
}


function drawQRCode() {
  let buffer = new Uint8Array(6 * 2); // six colors * 2 bytes each
  let index = 0;
  for (let color in COLORS) {
    let row = 0;
    for (let i=0; i<8; i++) {
      if (columnHasColor(i, color)) row += Math.pow(2, i);
    }
    buffer[index++] = row;

    row = 0;
    for (let i=8; i<16; i++) {
      if (columnHasColor(i, color)) row += Math.pow(2, i-8);
    }
    buffer[index++] = row;
  }
  qrcode.clear();
  qrcode.makeCode("http://naver.com");
}


function columnHasColor(col, color) {
  for (let row=0; row<ROWS; row++) {
    let slot = slots[col][row];
    if (slot.drum != null && slot.drum.color == color) return true;
  }
  return false;
}


//------------------------------------------------------------------------
// while playing redraw the screen and schedule each new measure
//------------------------------------------------------------------------
function tick(timestamp) {

  let update = false;
  // process tempo change
  if (bpm != newBpm) {
    if (playing && context != null) {
      let last_beats = (context.currentTime - start_time) * bpm / 60;
      start_time = context.currentTime - last_beats * 60 / newBpm;
    }
    bpm = newBpm;
    update = true;
  }

  if (swing != newSwing) {
    swing = newSwing;
    update = true;
  }

  if (playing && update) {
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        slots[i][j].tempoChange();
      }
    }
    requeued = false;
  }


  if (isRunning() || playing) {
    draw(0);
  }
  if (playing) {
    beats = getCurrentBeat();
    if (beats > 3.5 && !requeued) {
      scheduleSounds(4.0 - beats);
      drawQRCode();
      requeued = true;
    }
    else if (beats < 1 && requeued) {
      requeued = false;
    }
  }
  if (isRunning() || playing) window.requestAnimationFrame(tick);

}


function generateCode() {
  let vars = [];
  let code = '';
  for (let i=0; i<COLS; i++) {
    let line = [];
    for (let j=0; j<ROWS; j++) {
      if (!slots[i][j].isEmpty()) {
        let v = slots[i][j].drum.vars[j];
        if (!line.includes(v)) line.push(v);
        if (!vars.includes(v)) vars.push(v);
      }
    }
    if (line.length == 0) {
      code += 'rest(0.25)\n';
    } else if (line.length == 1) {
      code += 'playNote(' + line + ', beats = 0.25)\n';
    }
    else {
      code += 'playNote([ ' + line.join(', ') + ' ], beats = 0.25)\n';
    }
  }
  for (let v of vars) {
    code = v + ' = ' + VAR_VALUES[v] + '\n' + code;
  }
  return code;
}


function toggleCode() {
  document.querySelector('#code').innerHTML = generateCode();
  document.querySelector('.code-container').classList.toggle('hidden');
}


function showCode() {
  document.querySelector('#code').innerHTML = generateCode();
  document.querySelector('.code-container').classList.remove('hidden');
}


function hideCode() {
  document.querySelector('.code-container').classList.add('hidden');
}


function swapDrums() {
  if (DRUM_KIT === DRUMS_ROLAND) {
    DRUM_KIT = DRUMS_ROCK;
    document.querySelector('#drumkit').innerHTML = 'Rock Drumkit';
  } else {
    DRUM_KIT = DRUMS_ROLAND;
    document.querySelector('#drumkit').innerHTML = 'Roland 808';
  }
  for (let drum of DRUM_KIT) {
    for (let sound of drum.sounds) {
      Slot.loadDrumSound(sound);
    }
  }
}


window.onload = function() {
  video = document.querySelector("#video");
  canvas = document.querySelector('#canvas');

  canvas.width = crop[2];
  canvas.height = crop[3];
  video.width = VWIDTH;
  video.height = VHEIGHT;
  DRUM_KIT = DRUMS_ROLAND;

  ctx = canvas.getContext('2d');

  // pre-load the drum samples
  for (let drum of DRUM_KIT) {
    for (let sound of drum.sounds) {
      Slot.loadDrumSound(sound);
    }
  }

  // create the slots
  for (let i = 0; i < COLS; i++) {
    slots.push([ ]);
    for (let j = 0; j < ROWS; j++) {
      let slot = new Slot(j, i);
      slots[i].push(slot);
      if (j == 2 && i > 4 && i <= 10) {
        slot.calibrate = DRUM_KIT[ i - 5 ].color;
      } else {
        slot.calibrate = "empty";
      }
    }
  }

  midiInit();
  canvas.onmousedown = function(e) { }
  canvas.onmousemove = function(e) { }
  canvas.onmouseup = function(e) { }

  document.querySelector('.video-container').onclick = function(e) { }
  document.querySelector("#swing").innerHTML = newSwing + "%";

  document.onkeydown = function(k) {
    if (k.repeat) return;
    console.log(k.keyCode);
    switch(k.keyCode) {

      case 81: playPause(); break;
      case 83: tempoUp(); break;
      case 73: tempoDown(); break;
      case 87: swapDrums(); break;
      case 65: toggleCode(); break;

/*
      case 86: Slot.previewDrumSound('ch.mp3'); break; // YELLOW DRUM
      case 88: Slot.previewDrumSound('rs.mp3'); break; // RED DRUM
      case 73: Slot.previewDrumSound('cp.mp3'); break; // WHITE
      case 53: Slot.previewDrumSound('sd.mp3'); break; // GREEN
      case 90: Slot.previewDrumSound('bd.mp3'); break; // BLUE
*/

      case 38: crop[1] -= 1; break;
      case 40: crop[1] += 1; break;
      case 39: crop[0] += 1; break;
      case 37: crop[0] -= 1; break;
      case 187: zoomIn(); break; // '+'
      case 189: zoomOut(); break; // '-'

      //case 188: swingDown(); break; // '<'
      //case 190: swingUp(); break; // '>'
      case 188: CUTOFF--; console.log(CUTOFF); break; // '<'
      case 190: CUTOFF++; console.log(CUTOFF); break; // '>'

      //case 70: console.log(crop); break;  // 'f'
      //case 86: startStopVideo(); break;  // 'v'
      case 32: playPause(); break;  // <space>
      default:
    }
  }
}


function zoomIn() {
  crop[2] *= 0.98;
  crop[3] *= 0.98;
  canvas.width = crop[2];
  canvas.height = crop[3];
  console.log(crop);
}

function zoomOut() {
  crop[2] /= 0.98;
  crop[3] /= 0.98;
  canvas.width = crop[2];
  canvas.height = crop[3];
  console.log(crop);
}


function midiEvent(data) {
  let c = data['command'];
  let n = data['note'];
  if (c === 9 && n === 51) {
    playPause();
  }
  else if (c === 9 && n === 73) {
    showCode();
  }
  else if (c === 8 && n === 73) {
    hideCode();
  }
  else if (c === 11 && n === 21) {
    setTempo(data['velocity'] + 50);
  }
  else if (c === 11 && n === 68) {
    setSwing(100.0 * data['velocity'] / 127);
  }
  else if (c != 8) {
    console.log(data);
  }
}


class Slot {

  static drumBuffers = { };


  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.drum = null;
    this._gain = null;
    this.calibrate = null;
    this.scan = [ 0, 0, 0 ];
  }

  isEmpty() {
    return this.drum == null;
  }


  draw(bx, by, bw, bh) {
    if (this.isEmpty()) return;

    let cb = getCurrentBeat();
    let mb = this.col * 0.25;
    let highlight = (playing && cb >= mb && cb <= mb + 0.25);
    ctx.save();
    {
      let m = this.isEmpty() ? bw * 0.45 : bw * 0.3;
      ctx.fillStyle = highlight ? 'white' : colorString(COLORS[this.drum.color].color);
      ctx.beginPath();
      ctx.arc(bx + bw/2, by + bh/2, bw - m * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawCalibration(bx, by, bw, bh) {
    if (this.calibrate != null && this.calibrate != 'empty') {
      ctx.save();
      ctx.strokeStyle = colorString(COLORS[this.calibrate].color);
      ctx.lineWidth = 8;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }
  }

  setDrum(drum) {
    if (drum != this.drum) {
      this.drum = drum;
      this.cancelSound();
      if (playing) this.scheduleSound(0);
    }
  }

  secondsToBeats(s) {
    return s * bpm / 60.0;
  }

  beatsToSeconds(beats) {
    return 60.0 * beats / bpm;
  }

  getAudioBuffer() {
    if (this.drum == null) {
      return null;
    } else {
      let sound = this.drum.sounds[this.row];
      return Slot.drumBuffers[sound];
    }
  }

  previewSound() {
    if (!playing) {
      this.cancelSound();
      this.playSound(0.125);
    }
  }

  scheduleSound(delayBeats) {
    if (this.drum == null) return;
    let swingBeat = 0.25;
    let swingVal = 0.5 + (swing / 100.0) * 0.3;
    if (this.col % 2 == 1) swingBeat = 0.5 * swingVal;
    let startBeat = this.col * 0.25 + (swingBeat - 0.25);
    let currBeat = getCurrentBeat();
    let repeatCount = 1;
    if (this.drum.name == "stutter_hat") {
      repeatCount = (this.row % 2 == 1) ? 2 : 3;
    }
    if (delayBeats > 0) {
      this.playSound(this.beatsToSeconds(delayBeats + startBeat), repeatCount);
    } else if ((currBeat < startBeat) || (this.col == 0 && currBeat < 0.05)) {
      this.playSound(this.beatsToSeconds(startBeat - currBeat), repeatCount);
    }
  }


  playSound(when, repeatCount = 1) {
    if (this.drum == null) return;
    let dest = context.destination;

    let buffer = this.getAudioBuffer();
    if (buffer == null) return;

    this._gain = context.createGain();
    this._gain.gain.value = 0.9;
    this._gain.connect(dest);

    let space = this.beatsToSeconds(0.25 / repeatCount);
    for (let i=0; i<repeatCount; i++) {
      let source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this._gain);
      source.start(when + space * i + context.currentTime);
    }
  }


  static previewDrumSound(sound) {
    let dest = context.destination;
    let buffer = Slot.drumBuffers[sound];
    if (buffer == null) return;
    let gain = context.createGain();
    gain.gain.value = 0.9;
    gain.connect(dest);
    let source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start(0);
  }


  cancelSound() {
    if (this._gain != null) {
      this._gain.gain.linearRampToValueAtTime(0, this._gain.context.currentTime + 0.125);
    }
  }


  tempoChange() {
    this.cancelSound();
    this.scheduleSound(0);
  }



  //------------------------------------------------------------------------
  // load drum sound from the given url
  //------------------------------------------------------------------------
  static loadDrumSound(name) {
    let url = "sounds/" + name;
    let request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    request.onload = function() {
      context.decodeAudioData(request.response, function(buffer) {
        Slot.drumBuffers[name] = buffer;
        console.log("loaded " + name);
      }, function () { console.log("error loading audio")});
    }
    request.send();
  }

}


var DRUMS_ROLAND = [
  // blue
  {
    name : "kick",
    //vars : [ "high_tom", "mid_tom", "low_tom", "kick", "kick" ],
    //sounds : [ "ht.mp3", "mt.mp3", "lt.mp3", "bd.mp3", "bd.mp3" ],
    vars : [ "kick", "kick", "kick", "kick", "kick" ],
    sounds : [ "808/bd.mp3", "808/bd.mp3", "808/bd.mp3", "808/bd.mp3", "808/bd.mp3" ],
    color : "blue"
  },

  // orange
  {
    name : "hat",
    vars : [ "open_hat", "hat", "hat", "hat", "hat" ],
    sounds : [ "808/oh.mp3", "808/ch.mp3", "808/ch.mp3", "808/ch.mp3", "808/ch.mp3" ],
    color : "orange"
  },

  // yellow
  {
    name : "stutter_hat",
    vars : [ "hat", "hat", "hat", "hat", "hat" ],
    sounds : [ "808/ch.mp3", "808/ch.mp3", "808/ch.mp3", "808/ch.mp3", "808/ch.mp3" ],
    color : "yellow"
  },

  // green
  {
    name : "snare",
    vars : [ "snare", "snare", "snare", "snare", "snare" ],
    sounds : [ "808/sd.mp3", "808/sd.mp3", "808/sd.mp3", "808/sd.mp3", "808/sd.mp3" ],
    color : "green"
  },

  // purple
  {
    name : "clap",
    vars : [ "clap", "clap", "clap", "clap", "clap" ],
    sounds : [ "808/cp.mp3", "808/cp.mp3", "808/cp.mp3", "808/cp.mp3", "808/cp.mp3" ],
    color : "purple"
  },

  // red
  {
    name : "rimshot",
    vars : [ "rimshot", "rimshot", "rimshot", "rimshot", "rimshot" ],
    sounds : [ "808/rs.mp3", "808/rs.mp3", "808/rs.mp3", "808/rs.mp3", "808/rs.mp3" ],
    color : "red"
  }
];


var DRUMS_ROCK = [
  // blue
  {
    name : "kick",
    vars : [ "kick", "kick", "kick", "kick", "kick" ],
    sounds : [ "rock/kick.wav", "rock/kick.wav", "rock/kick.wav", "rock/kick.wav", "rock/kick.wav" ],
    color : "blue"
  },

  // orange
  {
    name : "hat",
    vars : [ "open_hat", "hat", "hat", "hat", "hat" ],
    sounds : [ "rock/oh.wav", "rock/ch.wav", "rock/ch.wav", "rock/ch.wav", "rock/ch.wav" ],
    color : "orange"
  },

  // yellow
  {
    name : "stutter_hat",
    vars : [ "hat", "hat", "hat", "hat", "hat" ],
    sounds : [ "rock/ch.wav", "rock/ch.wav", "rock/ch.wav", "rock/ch.wav", "rock/ch.wav" ],
    color : "yellow"
  },

  // green
  {
    name : "snare",
    vars : [ "snare", "snare", "snare", "snare", "snare" ],
    sounds : [ "rock/sd.wav", "rock/sd.wav", "rock/sd.wav", "rock/sd.wav", "rock/sd.wav" ],
    color : "green"
  },

  // purple
  {
    name : "clap",
    vars : [ "clap", "clap", "clap", "clap", "clap" ],
    sounds : [ "rock/cp.wav", "rock/cp.wav", "rock/cp.wav", "rock/cp.wav", "rock/cp.wav" ],
    color : "purple"
  },

  // red
  {
    name : "shaker",
    vars : [ "shaker", "shaker", "shaker", "shaker", "shaker" ],
    sounds : [ "rock/shaker.wav", "rock/shaker.wav", "rock/shaker.wav", "rock/shaker.wav", "rock/shaker.wav" ],
    color : "red"
  }
];
