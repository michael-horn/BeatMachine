//----------------------------------------------------------------------
// use to calibrate the current camera setup
//----------------------------------------------------------------------
const ROWS = 5;
const COLS = 16;


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
var slots = []; // all of the balls recognized by the camera in this frame
var start_time = 0;
var requeued = false;

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


function getCurrentBeat() {
  return ((context.currentTime - start_time) * bpm / 60) % 4.0;
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
    let bw = w / COLS;
    let bh = h / ROWS;
    let m = bw * 0.45;

    ctx.save();
    {

      // draw beat regions
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, bw * 4, h);
      ctx.fillRect(bw * 8, 0, bw * 4, h);

      for (let i=0; i<COLS; i++) {
        for (let j=0; j<ROWS; j++) {
          let bx = i * bw;
          let by = j * bh;

          slots[i][j].setDrum(drum);
          slots[i][j].draw(bx, by, bw, bh);
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


function xToBeats(x) {
  let cw = canvas.width;
  let beatWidth = cw / 4.0;
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


  if (playing) {
    draw(0);
    beats = getCurrentBeat();
    if (beats > 3.5 && !requeued) {
      scheduleSounds(4.0 - beats);
      requeued = true;
    }
    else if (beats < 1 && requeued) {
      requeued = false;
    }
    window.requestAnimationFrame(tick);
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
      code += 'playNote([ ' + line.join(', ') + ' ], beats = 0.25)\n';
    }
  }
  for (let v of vars) {
    code = v + ' = ' + VAR_VALUES[v] + '\n' + code;
  }
  return code;
}


window.onload = function() {

  const params = new URLSearchParams(location.search);
  let pattern = params.get('pattern');
  let output = document.querySelector('#output');

  if (pattern != null) {
    let buffer = window.atob(pattern);
    let i = 0;
    for (let color in COLORS) {
      if (color == 'empty') continue;
      let p = color + ' ';
      let b = buffer.charCodeAt(i++);
      for (let col = 0; col < 8; col++) {
        p += ((b & 0x01) > 0) ? '*' : '-';
        b >>= 1;
      }
      b = buffer.charCodeAt(i++);
      for (let col = 8; col < 16; col++) {
        p += ((b & 0x01) > 0) ? '*' : '-';
        b >>= 1;
      }
      output.innerHTML += p + "<br>";
    }
  } else {
    output.innerHTML = 'No pattern';
  }

/*
  canvas = document.querySelector('#canvas');
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
    }
  }


  document.onkeydown = function(k) {
    if (k.repeat) return;
    console.log(k.keyCode);
    switch(k.keyCode) {
      case 81: playPause(); break;
      case 83: tempoUp(); break;
      case 73: tempoDown(); break;
      case 32: playPause(); break;  // <space>
      default:
    }
  }
  */
}


class Slot {

  static drumBuffers = { };


  constructor(row, col) {
    this.row = row;
    this.col = col;
    this.drum = null;
    this._gain = null;
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
