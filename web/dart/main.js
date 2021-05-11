var bpm = 90.0;

function beatsToSeconds(beats) { return beats / (bpm / 60.0); }

function secondsToBeats(s) { return s * (bpm / 60.0); }

function beatsToX(beats) { return ((beats % 4.0) / 4.0) * (w - 100) + 50; }

/// canvas dimensions
const w = 900;
const h = 300;

var start_time = 0;

var colors = [ "blue", "purple", "orange", "green", "cyan" ];    
var drums = [ "kick", "snare", "hat", "clap", "tom" ];

var playing = false;
  
var context = null;

var analyzer = null;
var dataArray = null;
  
// sounds scheduled to be played
var scheduled = [];
  
// AudioBuffers with drum sounds
var drumBuffers = { };
 
var slots = [ ];

var start_time = 0;

var playhead;



function Slot(row, col, color, drum, c) {
  this.on = false;
  this.row = row;
  this.col = col;
  this.color = color;
  this.drum = drum;
  this.r = 25;
  this.circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  
  var x = col * this.r * 2 + this.r + 50;
  var y = row * this.r * 2 + this.r + 25;
  this.circle.setAttribute('cx', x);
  this.circle.setAttribute('cy', y);
  this.circle.setAttribute('r', this.r - 10);
  this.circle.setAttribute('fill', '#0002');
  this.circle.setAttribute('class', 'slot');
  c.appendChild(this.circle);
  var self = this;

  this.circle.onclick = function(e) { 
    self.toggleCircle();
    updateMidiDevice(-1);
  }
  this.circle.ontouchstart = function(e) { 
    console.log('touch down');
    self.toggleCircle();
    e.stopImmediatePropagation();
    e.stopPropagation();
  }
  this.circle.ontouchend = function(e) {
    console.log('touch up');
  }


  this.toggleCircle = function() {
    if (this.on) {
      this.circle.setAttribute("fill", "#0002");
      this.circle.setAttribute("r", this.r - 12);
    } else {
      this.circle.setAttribute("fill", this.color);
      this.circle.setAttribute("r", this.r - 5);
      playSound(this.drum + ".wav", 0);
    }
    this.on = !this.on;
    generateCode();
  }


  this.clear = function() {
    if (!this.on) {
      this.circle.setAttribute("fill", "#0002");
      this.circle.setAttribute("r", this.r - 12);
    }
  }


  this.pump = function() {
    if (!this.on) this.circle.setAttribute("fill", "black");
  }
}


function generateCode() {
  var patterns = {
    'kick' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
    'snare' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
    'hat' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
    'tom' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ],
    'clap' : [ '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-' ]
  };

  for (let slot of slots) {
    if (slot.on) {
      patterns[slot.drum][slot.col] = '*';
    }
  }
  var code = "<h1>Python Code</h1>";
  for (let drum in patterns) {
    code += ('playPattern(' + drum + ', "' + patterns[drum].join('') + '")<br>');
  }
  document.getElementById("code").innerHTML = code;
}


//------------------------------------------------------------------------
// start / stop playback
//------------------------------------------------------------------------
function playPause() {
  playing ? pause() : play();
}


function play() {
  if (!playing) {
    start_time = context.currentTime;
    queueSequence();
    playing = true;
    document.getElementById("play-button").innerHTML = "Stop";
    tick(0);
  }
}


function pause() {
  if (playing) {
    playing = false;
    stopSounds();
    document.getElementById("play-button").innerHTML = "Play";
  }
}


//------------------------------------------------------------------------
// queue sequence of balls to start playback
//------------------------------------------------------------------------
 function queueSequence() {
  scheduled = [];
  let now = context.currentTime;
  let bar = Math.round((now - start_time) / beatsToSeconds(4.0));
  let start = start_time + bar * beatsToSeconds(4.0);

  for (let slot of slots) {
    if (slot.on) {
      let time = beatsToSeconds(slot.col / 4.0);
      playSound(slot.drum + ".wav", start + time);
    }
  }
  queued = true;
}
var queued = false;


//------------------------------------------------------------------------
// stop all sounds
//------------------------------------------------------------------------
function stopSounds() {
  for (let sound of scheduled) { sound.stop(0); }
  scheduled = [];
}


//------------------------------------------------------------------------
// schedule sound to be played
//------------------------------------------------------------------------
function playSound(name, time) {
  var buffer = drumBuffers[name]; 
  var source = context.createBufferSource(); // creates a sound source
  source.buffer = buffer;                    // tell the source which sound to play
  source.connect(analyzer);
  
  source.start(time);  
  scheduled.push(source);
}


//------------------------------------------------------------------------
// load drum sound from the given url
//------------------------------------------------------------------------
function loadDrumSound(name) {
  let url = "sounds/" + name;
  let request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';
  request.onload = function() {
    context.decodeAudioData(request.response, function(buffer) {
      drumBuffers[name] = buffer; 
    }, function () { console.log("error loading audio")});
  }
  request.send();
}


//------------------------------------------------------------------------
// while playing redraw the screen and schedule each new measure
//------------------------------------------------------------------------
function tick(timestamp) {
  if (playing) {
    let now = context.currentTime;
    let secondsPerMeasure = 4.0 / (bpm / 60.0);

    beats = secondsToBeats((now - start_time) % secondsPerMeasure);
    draw(beats);
    window.requestAnimationFrame(tick);
    if (beats > 3.5 && !queued) {
      queueSequence();
    }
    else if (beats < 1 && queued) {
      queued = false;
    }
  }
}


//------------------------------------------------------------------------
// refresh the playhead
//------------------------------------------------------------------------
var _lastcol = -1;
function draw(beats) {
  let x = beatsToX(beats);
  playhead.setAttribute("x1", x);
  playhead.setAttribute("x2", x);

  let col = Math.round(beats * 4);
  if (col != _lastcol) updateMidiDevice(col);
  _lastcol = col;

  analyzer.getByteFrequencyData(dataArray);
/*
  for (let slot of slots) {
    slot.clear();
    let v = Math.floor(5 * dataArray[slot.col] / 255);
    if (v > (4 - slot.row)) {
      slot.pump();
    }
  }
*/
}


function midiEvent(data) {
  //console.log(data);
  let note = data['note'];

  // RESONANCE KNOB
  if (data['command'] == 11 && note == 19) {
    // turning clockwize
    if (data['velocity'] == 1) {
      bpm ++;
      if (bpm > 300) bpm = 300;
    } else {
      bpm --;
      if (bpm < 30) bpm = 30;
    }
    console.log(bpm);
  }
  // note on
  if (data['command'] == 9) {

    // play button
    if (note == 51) {
      play();
    }

    // stop button
    else if (note == 52) {
      pause();
    }

    // beat pad
    else {
      note -= 54;
      if (note >= 0) {
        let row = Math.floor(note / 16);
        let col = note % 16;
        for (let slot of slots) {
          if (slot.row == row && slot.col == col) {
            slot.toggleCircle();
            updateMidiDevice(-1);
            break;
          }
        }
      }
    }
  }
}


function updateMidiDevice(playhead) {
  var pads = [];
  var pcolors = {
    "blue" : [ 0.0, 0.1, 0.5 ],
    "purple" : [ 0.3, 0.0, 0.5 ],
    "orange" : [ 0.5, 0.3, 0.0 ],
    "green" : [ 0.0, 0.5, 0.0 ],
    "cyan" : [ 0.0, 0.5, 0.3 ]
  }

  for (let i=0; i<64; i++) {
    let col = i % 16;
    if (col == playhead) {
      pads.push( [ 0.1, 0.1, 0.1] );
    } else {
      pads.push( [ 0.025, 0.025, 0.025] );
    }
  }

  for (let slot of slots) {
    let index = slot.row * 16 + slot.col;
    if (slot.on) {
      pads[index] = pcolors[slot.color];
      if (slot.col == playhead) {
        pads[index] = [ 0.2, 0.2, 0.2 ];
      }
    }
  }

  lightFirePads(pads);
  lightButton(0x33, 0x03);
}


//------------------------------------------------------------------------
// create the slots of the drum machine and load sounds
//------------------------------------------------------------------------
window.onload = function() {

  var container = document.getElementById("beat-machine");
  
  for (let drum of drums) {
    loadDrumSound(drum + ".wav");
  }

  var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", 0);
  rect.setAttribute("y", 0);
  rect.setAttribute("width", w);
  rect.setAttribute("height", h);
  rect.setAttribute("fill", "#f7f7f2");
  container.appendChild(rect);

  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 5; j++) {
      slots.push(new Slot(j, i, colors[j], drums[j], container, this));
    }
  }
  
  playhead = document.createElementNS("http://www.w3.org/2000/svg", "line");
  playhead.setAttribute("x1", 0);
  playhead.setAttribute("y1", 0);
  playhead.setAttribute("x2", 0);
  playhead.setAttribute("y2", h);
  playhead.setAttribute("fill", "none");
  playhead.setAttribute("stroke", "gold");
  playhead.setAttribute("stroke-width", 6);
  container.appendChild(playhead);

  context = new AudioContext();
  analyzer = context.createAnalyser();
  analyzer.fftSize = 32;
  var bufferLength = analyzer.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  analyzer.connect(context.destination);

  document.getElementById("play-button").onclick = playPause;

  document.addEventListener('contextmenu', event => event.preventDefault());

  // init midi device
  midiInit();
}

