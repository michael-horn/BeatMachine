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

var bpm = 90.0;   // beats per minute
var swing = 0.5;  // swing percentage


var context = new AudioContext();
var playing = false;   // is beat machine playing or paused
var canvas;
var ctx; // canvas rendering context
var video;  // <video> element
var videoStream = null;
var dragging = false;
var slots = []; // all of the balls recognized by the camera in this frame
var start_time = 0;


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
function setTempo(newBPM) {
  newBPM = Math.min(Math.max(newBPM, 5), 300);
  if (playing && context != null) {
    let last_beats = (context.currentTime - start_time) * bpm / 60;
    start_time = context.currentTime - last_beats * 60 / newBPM;
  }
  bpm = newBPM;
  document.querySelector("#tempo").innerHTML = bpm;
  if (playing) {
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        slots[i][j].tempoChange();
      }
    }
    requeued = false;
  }
}


//------------------------------------------------------------------------
// change swing
//------------------------------------------------------------------------
function setSwing(newSwing) {
  newSwing = Math.min(Math.max(newSwing, 0.15), 0.85);
  swing = newSwing;
  document.querySelector("#swing").innerHTML = Math.round(swing * 100) + "%";
  if (playing) {
    for (let i = 0; i < COLS; i++) {
      for (let j = 0; j < ROWS; j++) {
        slots[i][j].tempoChange();
      }
    }
    requeued = false;
  }
}

function swingUp() { setSwing(swing + 0.01); }
function swingDown() { setSwing(swing - 0.01); }


function tempoUp() {
  setTempo(bpm + 5);
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

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (dragging) {
      ctx.drawImage(video, 0, 0, w, h);
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
      return;
    }

    ctx.drawImage(video, cx, cy, cw, ch, 0, 0, w, h);
    let idata = ctx.getImageData(cx, cy, cw, ch);
    let m = bw / 6.0;

    let blue = [ 0, 0, 255 ];
    let red = [ 255, 0, 0 ];
    let green = [ 0, 255, 0 ];
    let pink = [ 255, 100, 50 ];
    let orange = [ 255, 200, 0 ];

    for (let i=0; i<COLS; i++) {
      for (let j=0; j<ROWS; j++) {
        let bx = i * bw;
        let by = j * bh;
        let scan = scanRect(idata, bx + m, by + m, bw - m * 2, bh - m * 2, cw);

        let dist = colorDistance([20, 20, 20], scan);
        let dR = colorDistance(red, scan);
        let dG = colorDistance(green, scan);
        let dB = colorDistance(blue, scan);
        let dO = colorDistance(orange, scan);
        let color = 'rgba(0,0,0,0)';
        if (dR < dist) {
          color = colorString(red);
          dist = dR;
        }
        if (dG < dist) {
          color = colorString(green);
          dist = dG;
        }
        if (dB < dist) {
          color = colorString(blue);
          dist = dB;
        }
        if (dO < dist) {
          color = 'orange';
          dist = dO;
        }
        //ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx + bx + bw/2, cy + by + bh/2, m, 0, Math.PI * 2);
        ctx.fill();
      }
    }
/*
    ctx.beginPath();
    ctx.moveTo(beatsToX(beats), cropTop);
    ctx.lineTo(beatsToX(beats), canvas.height - cropBottom);
    ctx.strokeStyle = "gold";
    ctx.lineWidth = 5;
    ctx.stroke();
    */
    ctx.restore();
  }
}



function isRunning() {
  return videoStream != null;
}


function beatsToX(beats) {
  let cw = crop[3];
  let beatWidth = cw / 4.0;
  return crop[0] + beatWidth * beats + beatWidth * 0.125;
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
  if (isRunning()) {
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
}


window.onload = function() {
  video = document.querySelector("#video");
  canvas = document.querySelector('#canvas');
  ctx = canvas.getContext('2d');

  // pre-load the drum samples
  Slot.loadDrumSound("bd.mp3");
  Slot.loadDrumSound("sd.mp3");
  Slot.loadDrumSound("mt.mp3");
  Slot.loadDrumSound("ch.mp3");
  Slot.loadDrumSound("clap.mp3");


  // create the slots
  for (let i = 0; i < COLS; i++) {
    slots.push([ ]);
    for (let j = 0; j < ROWS; j++) {
      slots[i].push(new Slot(j, i));
    }
  }
  slots[0][0].color = 'blue';
  slots[4][0].color = 'blue';
  slots[8][0].color = 'blue';
  slots[12][0].color = 'blue';
  slots[2][0].color = 'green';
  slots[6][0].color = 'green';
  slots[10][0].color = 'green';
  slots[14][0].color = 'green';
  slots[1][0].color = 'orange';
  slots[5][0].color = 'orange';
  slots[9][0].color = 'orange';
  slots[13][0].color = 'orange';

  midiInit();
  let downX = -1, downY = -1;
  canvas.onmousedown = function(e) {
    downX = e.offsetX;
    downY = e.offsetY;
    if (e.shiftKey) {
      dragging = true;
      document.querySelector('#canvas').classList.remove('cropped');
      canvas.width = 640;
      canvas.height = 480;
      crop[0] = downX;
      crop[1] = downY;
      crop[2] = 0;
      crop[3] = 0;
    }
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
      case 38: crop[1] -= 1; break;
      case 40: crop[1] += 1; break;
      case 39: crop[0] += 1; break;
      case 37: crop[0] -= 1; break;
      case 81: resetCrop(); break;  // 'q'
      case 187: // zoom in
        break;
      case 189:  // zoom out
        break;

      case 188: swingDown(); break; // '<'
      case 190: swingUp(); break; // '>'
      case 70:  // 'f'
        console.log(crop); break;

      case 86: startStopVideo(); break;  // 'v'
      case 32: playPause(); break;  // <space>
      default:
        console.log(k.keyCode);
    }
  }
}


function midiEvent(data) {
  let c == data['command'];
  let n == data['note'];
  if (c === 9 && n === 51) {
    playPause();
  }
  else if (c === 9 && n === 73) {
    // fill
  }
  else if (c === 11 && n === 21) {
    setTempo(data['velocity'] * 2 + 30);
  }
  else if (c === 11 && n === 68) {
    let s = data['velocity'] / 127;
    setSwing(s * 0.6 + 0.2);
  }
  else {
    console.log(data);
  }
}


class Slot {

  static drumBuffers = { };

  // maps ball color to drum sound
  static colors = {
    "blue" : "bd",
    "green" : "sd",
    "orange" : "ch",
    "red" : "mt",
    "pink" : "clap"
  };


  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.color = null;
    this._gain = null;
    this._source = null;
  }


  setColor(color) {
    if (color != this.color) {
      this.color = color;
      cancelSound();
      playing ? scheduleSound(0) : previewSound();
    }
  }


  secondsToBeats(s) {
    return s * bpm / 60.0;
  }


  beatsToSeconds(beats) {
    return 60.0 * beats / bpm;
  }


  getAudioBuffer() {
    return (this.color == null) ? null : Slot.drumBuffers[Slot.colors[this.color] + '.mp3'];
  }


  previewSound() {
    if (!playing) {
      this.cancelSound();
      this.playSound(0.125);
    }
  }


  scheduleSound(delayBeats) {
    let swingBeat = 0.25;
    if (this.col % 2 == 1) swingBeat = 0.5 * swing;
    let startBeat = this.col * 0.25 + (swingBeat - 0.25);
    let currBeat = getCurrentBeat();
    if (delayBeats > 0) {
      this.playSound(this.beatsToSeconds(delayBeats + startBeat));
    }
    else if (currBeat < startBeat + 0.05) {
      this.playSound(this.beatsToSeconds(startBeat - currBeat));
    }
  }


  playSound(when) {
    if (this.color == null) return;
    let dest = context.destination;

    let buffer = this.getAudioBuffer();
    if (buffer == null) return;

    this._gain = context.createGain();
    this._gain.gain.value = 0.9;
    this._gain.connect(dest);

    this._source = context.createBufferSource();
    this._source.buffer = buffer;
    this._source.connect(this._gain);
    this._source.start(when + context.currentTime);
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
