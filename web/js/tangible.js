///--------------------------------------------------------------------
/// INSTRUCTIONS
///  1. Press 'v' to start / stop camera
///  2. SHIFT + mouse drag to crop video stream around board
///  3. Press 'q' to reset crop
///  4. Press <space> to play / pause
///  5. Press arrow keys to adjust crop position
///  6. Press '<' and '>' keys to adjust swing
//----------------------------------------------------------------------
// use to calibrate the current camera setup
//----------------------------------------------------------------------
const ROWS = 5;
const COLS = 16;
var crop = [ 0, 0, 640, 480 ];

var bpm = 90.0, newBpm = 90.0;   // beats per minute
var swing = 0, newSwing = 0;  // swing percentage


var DRUM_KIT = [
  // blue
  {
    name : "kick",
    vars : [ "high_tom", "mid_tom", "low_tom", "kick", "kick" ],
    sounds : [ "ht.mp3", "mt.mp3", "lt.mp3", "bd.mp3", "bd.mp3" ],
    color : [ 50, 50, 255 ]
  },

  // orange
  {
    name : "hat",
    vars : [ "hat", "hat", "open_hat", "hat", "hat" ],
    sounds : [ "ch.mp3", "ch.mp3", "oh.mp3", "ch.mp3", "ch.mp3" ],
    color : [ 255, 150, 40 ]
  },

  // green
  {
    name : "snare",
    vars : [ "snare", "snare", "snare", "snare", "snare" ],
    sounds : [ "sd.mp3", "sd.mp3", "sd.mp3", "sd.mp3", "sd.mp3" ],
    color : [ 90, 255, 150 ]
  },

  // purple
  {
    name : "clap",
    vars : [ "clap", "clap", "clap", "clap", "clap" ],
    sounds : [ "cp.mp3", "cp.mp3", "cp.mp3", "cp.mp3", "cp.mp3" ],
    color : [ 255, 50, 200 ]
  },

  // red
  {
    name : "red",
    vars : [ "cymbal", "cowbell", "rimshot", "cowbell", "rimshot" ],
    sounds : [ "cy.mp3", "cb.mp3", "rs.mp3", "cb.mp3", "rs.mp3" ],
    color : [ 255, 0, 0 ]
  }
];
var EMPTY = { name : "empty", vars : [ ], sounds : [ ], color : [ 0, 0, 0 ] };


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


var context = new AudioContext();
var playing = false;   // is beat machine playing or paused
var canvas;
var ctx; // canvas rendering context
var video;  // <video> element
var videoStream = null;
var dragging = false;
var slots = []; // all of the balls recognized by the camera in this frame
var start_time = 0;
var debug = false;


function isCropped() {
  return (crop[0] > 0 || crop[1] > 0 || crop[2] < 640 || crop[3] < 480);
}


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
  //let bar = Math.round((now - start_time) / beatsToSeconds(4.0));
  //let start = start_time + bar * beatsToSeconds(4.0);
}


//------------------------------------------------------------------------
// change tempo
//------------------------------------------------------------------------
function setTempo(t) {
  newBpm = Math.min(Math.max(t, 5), 300);
  document.querySelector("#tempo").innerHTML = newBpm;
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
    navigator.mediaDevices.getUserMedia({ video: true })
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
          if (slot.calibrate != null && slot.calibrate.name == drum.name) {
            r += slot.scan[0];
            g += slot.scan[1];
            b += slot.scan[2];
            count++;
          }
        }
      }
      if (count > 0) {
        drum.color = [ r/count, g/count, b/count ];
        console.log(drum);
      }
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
    let cw = Math.max(crop[2], 1);
    let ch = Math.max(crop[3], 1);
    let bw = cw / COLS;
    let bh = ch / ROWS;
    let m = bw * 0.4;
    let idata = null;

    ctx.save();
    {
      ctx.clearRect(0, 0, w, h);

      if (dragging) {
        ctx.drawImage(video, 0, 0, w, h);
      } else {
        ctx.drawImage(video, cx, cy, cw, ch, 0, 0, w, h);
        cx = 0;
        cy = 0;
        cw = w;
        ch = h;
      }

      idata = ctx.getImageData(cx, cy, cw, ch);
      if (dragging || debug) drawGrid(cx, cy, cw, ch);

      // draw beat regions
      if (isCropped()) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(cx, cy, bw * 4, ch);
        ctx.fillRect(cx + bw * 8, cy, bw * 4, ch);
      }

      for (let i=0; i<COLS; i++) {
        for (let j=0; j<ROWS; j++) {
          let bx = i * bw;
          let by = j * bh;
          let scan = scanRect(idata, bx + m, by + m, bw - m * 2, bh - m * 2, cw);
          let delta = colorDistance(EMPTY.color, scan);
          let drum = EMPTY;

          for (let d of DRUM_KIT) {
            let dist = colorDistance(d.color, scan);
            if (dist < delta) {
              drum = d;
              delta = dist;
            }
          }

          slots[i][j].setDrum(drum);
          slots[i][j].scan = scan;


          if (dragging) {
            if (bw - m * 2 > 2) {
              //ctx.fillStyle = colorString(scan);
              ctx.fillStyle = colorString(drum.color);
              ctx.beginPath();
              ctx.arc(cx + bx + bw/2, cy + by + bh/2, bw - m * 2, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (isCropped()) {
            slots[i][j].draw(bx, by, bw, bh, debug);
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
      requeued = true;
    }
    else if (beats < 1 && requeued) {
      requeued = false;
    }
  }
  if (isRunning() || playing) window.requestAnimationFrame(tick);

}
let requeued = false;



function resetCrop() {
  crop = [ 0, 0, 640, 480 ];
  canvas.width = 640;
  canvas.height = 480;
  document.querySelector('#canvas').classList.remove('cropped');
  draw();
  saveState();
}


function saveState() {
  localStorage.setItem('crop', JSON.stringify(crop));
}


function loadState() {
  if (localStorage.getItem('crop') != null) {
    crop = JSON.parse(localStorage.getItem('crop'));
    canvas.width = crop[2];
    canvas.height = crop[3];
    document.querySelector('#canvas').classList.add('cropped');
  }
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
      code += 'playNote([ ' + line + ' ], beats = 0.25)\n';
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


window.onload = function() {
  video = document.querySelector("#video");
  canvas = document.querySelector('#canvas');
  ctx = canvas.getContext('2d');

  loadState();

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
      if (i % ROWS == j) {
        slot.calibrate = DRUM_KIT[ i % DRUM_KIT.length ];
      }
    }
  }

  midiInit();
  let downX = -1, downY = -1;
  canvas.onmousedown = function(e) {
    downX = e.offsetX;
    downY = e.offsetY;
//    if (e.shiftKey) {
      dragging = true;
      document.querySelector('#canvas').classList.remove('cropped');
      canvas.width = 640;
      canvas.height = 480;
      crop[0] = downX;
      crop[1] = downY;
      crop[2] = 0;
      crop[3] = 0;
//    }
  }
  canvas.onmousemove = function(e) {
    if (dragging) {
      crop[2] = e.offsetX - crop[0];
      crop[3] = e.offsetY - crop[1];
    }
  }
  canvas.onmouseup = function(e) {
    if (dragging && crop[2] > 0 && crop[3] > 0) {
      document.querySelector('#canvas').classList.add('cropped');
      canvas.width = crop[2];
      canvas.height = crop[3];
      saveState();
    } else {
      console.log('clicked on canvas');
    }
    draw();
  }

  document.querySelector('.video-container').onclick = function(e) {
    if (downX < 0) resetCrop();
    dragging = false;
    downX = -1;
    downY = -1;
  }


  document.onkeydown = function(k) {
    //console.log(k.keyCode);
    switch(k.keyCode) {
      case 38: crop[1] -= 1; saveState(); break;
      case 40: crop[1] += 1; saveState(); break;
      case 39: crop[0] += 1; saveState(); break;
      case 37: crop[0] -= 1; saveState(); break;
      case 67: toggleCode(); break // 'c'
      case 81: resetCrop(); break;  // 'q'
      case 187: tempoUp(); break;  // '+'
      case 189: tempoDown(); break;  // '-'
      case 188: swingDown(); break; // '<'
      case 190: swingUp(); break; // '>'
      case 70: console.log(crop); break;  // 'f'
      case 86: startStopVideo(); break;  // 'v'
      case 32: playPause(); break;  // <space>
      default:
        console.log(k.keyCode);
    }
  }
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
    this.drum = EMPTY;
    this._gain = null;
    this.calibrate = null;
    this.scan = [ 0, 0, 0 ];
  }

  isEmpty() {
    return (this.drum == null || this.drum.name == "empty");
  }


  draw(bx, by, bw, bh, debug) {
    if (!debug && this.isEmpty()) return;

    let cb = getCurrentBeat();
    let mb = this.col * 0.25;
    let highlight = (playing && cb >= mb && cb <= mb + 0.25);
    ctx.save();
    {
      let m = this.isEmpty() ? bw * 0.45 : bw * 0.3;
      ctx.fillStyle = highlight ? 'white' : colorString(this.drum.color);
      ctx.beginPath();
      ctx.arc(bx + bw/2, by + bh/2, bw - m * 2, 0, Math.PI * 2);
      ctx.fill();
      if (debug && this.calibrate != null) {
        ctx.strokeStyle = colorString(this.calibrate.color);
        ctx.lineWidth = 5;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
    ctx.restore();
  }

  setDrum(drum) {
    if (drum.name != this.drum.name) {
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
    let swingBeat = 0.25;
    let swingVal = 0.5 + (swing / 100.0) * 0.3;
    if (this.col % 2 == 1) swingBeat = 0.5 * swingVal;
    let startBeat = this.col * 0.25 + (swingBeat - 0.25);
    let currBeat = getCurrentBeat();
    let repeatCount = 1;
    if (this.drum.name == "hat" && this.row == 0) {
      repeatCount = 3;
    } else if (this.drum.name == "hat" && this.row == 1) {
      repeatCount = 2;
    }
    if (delayBeats > 0) {
      this.playSound(this.beatsToSeconds(delayBeats + startBeat), repeatCount);
    } else if ((currBeat < startBeat) || (this.col == 0 && currBeat < 0.05)) {
      this.playSound(this.beatsToSeconds(startBeat - currBeat), repeatCount);
    }
  }


  playSound(when, repeatCount = 1) {
    if (this.drum == null || this.drum.name === "empty") return;
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
